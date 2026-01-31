import Decimal from "decimal.js";
import { Injectable, BadRequestException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { Transaction } from "../entities/transaction.entity";
import { ExchangeRateEntity } from "../entities/exchange-rate.entity";

@Injectable()
export class TransactionsService {
  constructor(private readonly dataSource: DataSource) {}

  /** Postgres BIGINT w TypeORM często jest stringiem — wymagamy stringa z cyfr */
  private toBigintString(value: unknown, field: string): string {
    const s = String(value ?? "").trim();
    if (!/^\d+$/.test(s)) {
      throw new BadRequestException(`${field} must be a bigint numeric string (got: ${String(value)})`);
    }
    if (s === "0") {
      throw new BadRequestException(`${field} must be > 0`);
    }
    return s;
  }

  async deposit(userId: string, walletId: string, pln: string) {
    const uid = this.toBigintString(userId, "userId");
    const wid = this.toBigintString(walletId, "walletId");

    const plnDec = new Decimal(pln);
    if (!plnDec.isFinite() || plnDec.lte(0)) {
      throw new BadRequestException("Invalid amount");
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      // 1) update PLN
      const upd = await qr.query(
        `
        UPDATE wallets
        SET balance_pln = balance_pln + $1
        WHERE id = $2
        RETURNING id;
        `,
        [plnDec.toFixed(2), wid]
      );
      if (!upd?.length) throw new BadRequestException("Wallet not found");

      // 2) insert transaction (DEPOSIT: currency_code NULL, rate NULL, ccy_amount NULL)
        const tx = qr.manager.create(Transaction, {
          userId: uid,
          walletId: wid,
          type: "DEPOSIT",
          currencyCode: null,
          rate: null,
          amount: plnDec.toFixed(2), // legacy
          plnAmount: plnDec.toFixed(2),
          ccyAmount: null,
          status: "POSTED",
        });

      await qr.manager.save(Transaction, tx);

      await qr.commitTransaction();
      return tx;
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async buy(
    userId: string,
    walletId: string,
    currencyCode: string,
    ccyAmountStr: string,
    rateDateISO: string
  ) {
    const uid = this.toBigintString(userId, "userId");
    const wid = this.toBigintString(walletId, "walletId");

    const ccy = new Decimal(ccyAmountStr);
    if (!ccy.isFinite() || ccy.lte(0)) throw new BadRequestException("Invalid currency amount");

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const rateRow = await qr.manager.findOne(ExchangeRateEntity, {
        where: { currencyCode, rateDate: rateDateISO as any },
      });

      if (rateRow === null) throw new BadRequestException("Rate not found");

      const sellRate = new Decimal(rateRow.sellRate as any);
      if (!sellRate.isFinite() || sellRate.lte(0)) throw new BadRequestException("Invalid rate");

      const plnToPay = ccy.mul(sellRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const plnDelta = plnToPay.neg(); // PLN schodzi (ujemny)
      const ccyDelta = ccy;            // waluta rośnie (dodatni)

      // 1) odejmij PLN z warunkiem >=0
      const updPln = await qr.query(
        `
        UPDATE wallets
        SET balance_pln = balance_pln + $1
        WHERE id = $2
          AND balance_pln + $1 >= 0
        RETURNING id;
        `,
        [plnDelta.toFixed(2), wid]
      );
      if (!updPln?.length) throw new BadRequestException("Insufficient PLN funds");

      // 2) dodaj walutę (upsert)
      await qr.query(
        `
        INSERT INTO wallet_currency_balances (wallet_id, currency_code, amount)
        VALUES ($1, $2, $3)
        ON CONFLICT (wallet_id, currency_code)
        DO UPDATE SET amount = wallet_currency_balances.amount + EXCLUDED.amount;
        `,
        [wid, currencyCode, ccyDelta.toFixed(2)]
      );

      // 3) transakcja: BUY wymaga pln_amount<0, ccy_amount>0
      const tx = qr.manager.create(Transaction, {
        userId: uid,
        walletId: wid,
        type: "BUY",
        currencyCode,
        rate: sellRate.toFixed(6),
        amount: ccy.toFixed(2), // USTALONE: amount = ilość waluty
        plnAmount: plnDelta.toFixed(2),
        ccyAmount: ccyDelta.toFixed(2),
        status: "POSTED",
      });

      await qr.manager.save(Transaction, tx);

      await qr.commitTransaction();
      return tx;
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async sell(
    userId: string,
    walletId: string,
    currencyCode: string,
    ccyAmountStr: string,
    rateDateISO: string
  ) {
    const uid = this.toBigintString(userId, "userId");
    const wid = this.toBigintString(walletId, "walletId");

    const ccy = new Decimal(ccyAmountStr);
    if (!ccy.isFinite() || ccy.lte(0)) throw new BadRequestException("Invalid currency amount");

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const rateRow = await qr.manager.findOne(ExchangeRateEntity, {
        where: { currencyCode, rateDate: rateDateISO as any },
      });

      if (rateRow === null) throw new BadRequestException("Rate not found");

      const buyRate = new Decimal(rateRow.buyRate as any);
      if (!buyRate.isFinite() || buyRate.lte(0)) throw new BadRequestException("Invalid rate");

      const plnToGet = ccy.mul(buyRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const ccyDelta = ccy.neg(); // waluta schodzi (ujemny)
      const plnDelta = plnToGet;  // PLN rośnie (dodatni)

      // 1) odejmij walutę z warunkiem >=0
      const updCcy = await qr.query(
        `
        UPDATE wallet_currency_balances
        SET amount = amount + $1
        WHERE wallet_id = $2
          AND currency_code = $3
          AND amount + $1 >= 0
        RETURNING id;
        `,
        [ccyDelta.toFixed(2), wid, currencyCode]
      );
      if (!updCcy?.length) throw new BadRequestException("Insufficient currency funds");

      // 2) dodaj PLN
      await qr.query(
        `
        UPDATE wallets
        SET balance_pln = balance_pln + $1
        WHERE id = $2
        RETURNING id;
        `,
        [plnDelta.toFixed(2), wid]
      );

      // 3) transakcja: SELL wymaga pln_amount>0, ccy_amount<0
      const tx = qr.manager.create(Transaction, {
        userId: uid,
        walletId: wid,
        type: "SELL",
        currencyCode,
        rate: buyRate.toFixed(6),
        amount: ccy.toFixed(2), // amount = ilość waluty
        plnAmount: plnDelta.toFixed(2),
        ccyAmount: ccyDelta.toFixed(2),
        status: "POSTED",
      });

      await qr.manager.save(Transaction, tx);

      await qr.commitTransaction();
      return tx;
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  async findForUser(userId: string, opts: { limit?: number; offset?: number } = {}) {
    const uid = this.toBigintString(userId, "userId");
    const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
    const offset = Math.max(Number(opts.offset) || 0, 0);

    const repo = this.dataSource.getRepository(Transaction);

    const [items, total] = await repo.findAndCount({
      where: { userId: uid as any }, // jeśli encja ma userId: string, to pasuje; jeśli number — zmień encję, nie tutaj
      order: { createdAt: "DESC" as any },
      take: limit,
      skip: offset,
    });

    return { total, items, limit, offset };
  }
}
