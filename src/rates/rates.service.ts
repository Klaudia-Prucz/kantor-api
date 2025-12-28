import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExchangeRateEntity } from '../entities/exchange-rate.entity';

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

  /**
   * Pobiera tabelę A (kursy średnie) z NBP.
   */
  private async fetchNbpTableA(): Promise<{ date: string; rates: Record<string, number> }> {
    const url = 'https://api.nbp.pl/api/exchangerates/tables/A/?format=json';

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`NBP API error: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as NbpTableAResponse;
    const first = data[0];
    const date = first.effectiveDate;

    const map: Record<string, number> = {};
    for (const r of first.rates) {
      map[r.code.toUpperCase()] = r.mid;
    }

    return { date, rates: map };
  }

  /**
   * Zwraca najnowsze kursy.
   * Jeśli dla daty NBP nie ma jeszcze rekordów w DB -> zapisuje (na start 4 waluty).
   */
  async getLatest() {
    console.log('ENTER getLatest()');

    const { date, rates } = await this.fetchNbpTableA();
    console.log('NBP OK date=', date);

    // Na start zapisujemy tylko kilka walut (żeby nie wywaliło się na FK do currencies)
    const allowed = new Set(['USD', 'EUR', 'CHF', 'GBP']);

    const existingCount = await this.ratesRepo.count({ where: { rateDate: date } });
    console.log('existingCount=', existingCount);

    if (existingCount === 0) {
      const rows = Object.entries(rates)
        .filter(([code]) => allowed.has(code))
        .map(([code, mid]) =>
          this.ratesRepo.create({
            currencyCode: code,
            rateDate: date,
            buyRate: mid.toFixed(6),
            sellRate: mid.toFixed(6),
          }),
        );

      console.log('Saving:', rows.map((r) => r.currencyCode));
      await this.ratesRepo.save(rows);
      console.log('Saved OK');
    }

    const dbRows = await this.ratesRepo.find({ where: { rateDate: date } });
    console.log('dbRows=', dbRows.length);

    const out: Record<string, number> = {};
    for (const row of dbRows) {
      out[row.currencyCode] = Number(row.buyRate); // buy=sell=mid na start
    }

    return { date, rates: out };
  }

  /**
   * Historia kursów z bazy (dla jednej waluty).
   * from/to opcjonalne w formacie YYYY-MM-DD.
   */
  async getHistory(code: string, from?: string, to?: string) {
    const currencyCode = (code ?? '').trim().toUpperCase();
    if (!currencyCode) {
      throw new Error('Query param "code" is required (e.g. USD)');
    }

    const qb = this.ratesRepo
      .createQueryBuilder('r')
      .where('r.currencyCode = :currencyCode', { currencyCode })
      .orderBy('r.rateDate', 'ASC');

    if (from) qb.andWhere('r.rateDate >= :from', { from });
    if (to) qb.andWhere('r.rateDate <= :to', { to });

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
