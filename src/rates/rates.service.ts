import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ExchangeRateEntity } from "../entities/exchange-rate.entity";

type NbpTableAResponse = Array<{
  effectiveDate: string;
  rates: Array<{ code: string; mid: number }>;
}>;

@Injectable()
export class RatesService {
  constructor(
    @InjectRepository(ExchangeRateEntity)
    private readonly ratesRepo: Repository<ExchangeRateEntity>,
  ) {}

  // Na start zapisujemy tylko kilka walut (żeby nie wywaliło się na FK do currencies)
  private readonly allowed = new Set(["USD", "EUR", "CHF", "GBP"]);

  private isValidYMD(s: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");
  }

  /**
   * Pobiera tabelę A z NBP.
   * Jeśli podasz date, próbuje pobrać kursy z tej daty (NBP może zwrócić 404 w weekendy/święta).
   */
  private async fetchNbpTableA(date?: string): Promise<{ date: string; rates: Record<string, number> }> {
    const base = "https://api.nbp.pl/api/exchangerates/tables/A/";
    const url = date ? `${base}${date}/?format=json` : `${base}?format=json`;

    const res = await fetch(url);
    if (!res.ok) {
      // NBP daje 404 jeśli brak notowania dla tej daty (weekend/święto)
      if (res.status === 404) {
        throw new NotFoundException(
          "No NBP rates for this date (weekend/holiday or no publication). Choose a business day.",
        );
      }
      throw new BadRequestException(`NBP API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as NbpTableAResponse;
    const first = data?.[0];
    if (!first?.effectiveDate || !Array.isArray(first.rates)) {
      throw new BadRequestException("Unexpected NBP response format");
    }

    const out: Record<string, number> = {};
    for (const r of first.rates) {
      out[String(r.code).toUpperCase()] = Number(r.mid);
    }

    return { date: first.effectiveDate, rates: out };
  }

  /**
   * Zapisuje kursy dla konkretnej daty do DB (tylko allowed).
   * Jeśli już są w DB, nic nie robi.
   */
  private async ensureRatesInDbForDate(date: string) {
    const existingCount = await this.ratesRepo.count({ where: { rateDate: date } });
    if (existingCount > 0) return;

    const { rates } = await this.fetchNbpTableA(date);

    const rows = Object.entries(rates)
      .filter(([code]) => this.allowed.has(code))
      .map(([code, mid]) =>
        this.ratesRepo.create({
          currencyCode: code,
          rateDate: date,
          buyRate: mid.toFixed(6),
          sellRate: mid.toFixed(6),
        }),
      );

    await this.ratesRepo.save(rows);
  }

  /**
   * Zwraca najnowsze kursy:
   * - pobiera z NBP latest
   * - jeśli brak w DB dla tej daty => zapisuje (allowed)
   * - zwraca z DB jako {date, rates}
   */
  async getLatest() {
    const { date } = await this.fetchNbpTableA(); // NBP najnowsze
    await this.ensureRatesInDbForDate(date);

    const dbRows = await this.ratesRepo.find({ where: { rateDate: date } });

    const out: Record<string, number> = {};
    for (const row of dbRows) out[row.currencyCode] = Number(row.buyRate);

    return { date, rates: out };
  }

  /**
   * ✅ NOWE: kursy dla konkretnej daty (pod frontend /rates/history?date=YYYY-MM-DD)
   * - waliduje date
   * - jeśli brak w DB => próbuje pobrać z NBP i zapisać
   * - zwraca {date, rates}
   */
  async getByDate(date: string) {
    if (!this.isValidYMD(date)) {
      throw new BadRequestException("Invalid date format. Use YYYY-MM-DD.");
    }

    // Spróbuj DB
    let dbRows = await this.ratesRepo.find({ where: { rateDate: date } });

    // Jeśli brak -> pobierz z NBP i zapisz (może rzucić 404 dla weekendu)
    if (dbRows.length === 0) {
      await this.ensureRatesInDbForDate(date);
      dbRows = await this.ratesRepo.find({ where: { rateDate: date } });
    }

    if (dbRows.length === 0) {
      // Jeśli nadal brak, to znaczy że date nie ma w NBP (weekend) albo nic nie zapisano
      throw new NotFoundException("No rates found for this date.");
    }

    const out: Record<string, number> = {};
    for (const row of dbRows) out[row.currencyCode] = Number(row.buyRate);

    return { date, rates: out };
  }

  /**
   * Historia jednej waluty w zakresie dat.
   * (Twoja dotychczasowa funkcja – tylko lepsze walidacje i wyjątki)
   */
  async getHistory(code: string, from?: string, to?: string) {
    const currencyCode = String(code ?? "").trim().toUpperCase();
    if (!currencyCode) {
      throw new BadRequestException('Query param "code" is required (e.g. USD)');
    }
    if (from && !this.isValidYMD(from)) throw new BadRequestException('Invalid "from" date, use YYYY-MM-DD');
    if (to && !this.isValidYMD(to)) throw new BadRequestException('Invalid "to" date, use YYYY-MM-DD');

    const qb = this.ratesRepo
      .createQueryBuilder("r")
      .where("r.currencyCode = :currencyCode", { currencyCode })
      .orderBy("r.rateDate", "ASC");

    if (from) qb.andWhere("r.rateDate >= :from", { from });
    if (to) qb.andWhere("r.rateDate <= :to", { to });

    const rows = await qb.getMany();

    return {
      currency: currencyCode,
      count: rows.length,
      items: rows.map((r) => ({
        date: r.rateDate,
        buy: Number(r.buyRate),
        sell: Number(r.sellRate),
      })),
    };
  }
}
