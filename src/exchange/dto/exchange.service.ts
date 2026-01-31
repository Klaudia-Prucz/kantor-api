import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Wallet } from '../../entities/wallet.entity';
import { WalletCurrencyBalanceEntity } from '../../entities/wallet-currency-balance.entity';
import { Transaction } from '../../entities/transaction.entity';
import { ExchangeRateEntity } from '../../entities/exchange-rate.entity';
import { ExchangeDto } from '../dto/exchange.dto';
import Decimal from 'decimal.js';

@Injectable()
export class ExchangeService {
  constructor(
    private readonly dataSource: DataSource,

    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,

    @InjectRepository(WalletCurrencyBalanceEntity)
    private readonly balanceRepo: Repository<WalletCurrencyBalanceEntity>,

    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,

    @InjectRepository(ExchangeRateEntity)
    private readonly rateRepo: Repository<ExchangeRateEntity>,
  ) {}

  /** DB u Ciebie ewidentnie oczekuje BIGINT (22P02), więc userId musi być cyframi */
  private normalizeUserId(userId: unknown): string {
    const raw = String(userId ?? '').trim();
    if (!raw) throw new BadRequestException('Missing user id');

    // jeśli DB ma BIGINT/INT dla userId -> wymagamy cyfr
    if (!/^\d+$/.test(raw)) {
      throw new BadRequestException('Invalid user id');
    }
    return raw; // np. "12"
  }

  private normalizeCurrency(code: unknown) {
    return String(code ?? '').trim().toUpperCase();
  }

  private validateDto(dto: ExchangeDto) {
    const currency = this.normalizeCurrency(dto.currency);

    if (!currency || currency.length !== 3) {
      throw new BadRequestException('Invalid currency code');
    }
    if (currency === 'PLN') {
      throw new BadRequestException('Use DEPOSIT for PLN');
    }

    // DTO + ValidationPipe zwykle gwarantuje number, ale zostawiamy twardy check
    const amount = Number((dto as any)?.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }

    return { currency, amount };
  }

  private async getLatestRate(currency: string, repoOverride?: Repository<ExchangeRateEntity>) {
    const repo = repoOverride ?? this.rateRepo;

    const latest = await repo
      .createQueryBuilder('r')
      .select('MAX(r.rateDate)', 'max')
      .getRawOne<{ max: string | null }>();

    const latestDate = latest?.max;
    if (!latestDate) {
      throw new BadRequestException('No rates in DB. Call /rates/latest first.');
    }

    const row = await repo.findOne({ where: { currencyCode: currency, rateDate: latestDate } });
    if (!row) {
      throw new BadRequestException(`No rate for ${currency} at ${latestDate}`);
    }

    const buy = Number(row.buyRate);
    const sell = Number(row.sellRate);
    if (!Number.isFinite(buy) || !Number.isFinite(sell)) {
      throw new BadRequestException(`Invalid rates in DB for ${currency} at ${latestDate}`);
    }

    return { rateDate: latestDate, buy, sell };
  }

  async buy(userId: unknown, dto: ExchangeDto) {
    const uid = this.normalizeUserId(userId);
    const { currency, amount } = this.validateDto(dto);
    // Decimal is imported at the top
    return this.dataSource.transaction(async (manager) => {
      const rateRepo = manager.getRepository(ExchangeRateEntity);
      const txRepo = manager.getRepository(Transaction);
      const walletRepo = manager.getRepository(Wallet);

      // 1) wallet
      const wallet = await walletRepo.findOne({ where: { userId: uid } });
      if (!wallet) throw new BadRequestException('Wallet not found');

      // 2) kurs
      const rate = await this.getLatestRate(currency, rateRepo);
      const ccy = new Decimal(amount);
      const sellRate = new Decimal(rate.sell);
      const plnCost = ccy.mul(sellRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      // 1) PLN: warunek żeby nie zejść poniżej zera
      const updPln = await manager.query(
        `
        UPDATE wallets
        SET balance_pln = balance_pln + $1
        WHERE id = $2
          AND balance_pln + $1 >= 0
        RETURNING id;
        `,
        [plnCost.neg().toFixed(2), wallet.id]
      );
      if (!updPln?.length) throw new BadRequestException('Insufficient PLN funds');

      // 2) waluta: upsert + dodanie
      await manager.query(
        `
        INSERT INTO wallet_currency_balances (wallet_id, currency_code, amount)
        VALUES ($1, $2, $3)
        ON CONFLICT (wallet_id, currency_code)
        DO UPDATE SET amount = wallet_currency_balances.amount + EXCLUDED.amount;
        `,
        [wallet.id, currency, ccy.toFixed(2)]
      );

      // 3) zapis transakcji
      const tx = txRepo.create({
        userId: uid,
        walletId: wallet.id,
        currencyCode: currency,
        type: 'BUY',
        amount: ccy.toFixed(2),
        rate: sellRate.toFixed(6),
        ccyAmount: ccy.toFixed(2),
        plnAmount: plnCost.neg().toFixed(2),
        status: 'POSTED',
      } as any);
      await txRepo.save(tx);

      return {
        ok: true,
        type: 'BUY',
        currency,
        amount,
        rateDate: rate.rateDate,
        rate: rate.buy,
        costPLN: Number(plnCost.toFixed(2)),
        // newBalancePLN: Number(wallet.balancePLN),
      };
    });
  }

  async sell(userId: unknown, dto: ExchangeDto) {
    const uid = this.normalizeUserId(userId);
    const { currency, amount } = this.validateDto(dto);
    return this.dataSource.transaction(async (manager) => {
      const walletRepo = manager.getRepository(Wallet);
      const txRepo = manager.getRepository(Transaction);
      const rateRepo = manager.getRepository(ExchangeRateEntity);

      const wallet = await walletRepo.findOne({ where: { userId: uid } });
      if (!wallet) throw new BadRequestException('Wallet not found');

      const rate = await this.getLatestRate(currency, rateRepo);
      const ccy = new Decimal(amount);
      const buyRate = new Decimal(rate.buy);
      const plnGain = ccy.mul(buyRate).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      // 1) waluta: delta ujemna, nie może zejść poniżej zera
      const updCcy = await manager.query(
        `
        UPDATE wallet_currency_balances
        SET amount = amount + $1
        WHERE wallet_id = $2
          AND currency_code = $3
          AND amount + $1 >= 0
        RETURNING id;
        `,
        [ccy.neg().toFixed(2), wallet.id, currency]
      );
      if (!updCcy?.length) throw new BadRequestException('Insufficient currency funds');

      // 2) PLN: delta dodatnia
      await manager.query(
        `
        UPDATE wallets
        SET balance_pln = balance_pln + $1
        WHERE id = $2
        RETURNING id;
        `,
        [plnGain.toFixed(2), wallet.id]
      );

      // 3) insert tx (z plnAmount/ccyAmount)
      const tx = txRepo.create({
        userId: uid,
        walletId: wallet.id,
        currencyCode: currency,
        type: 'SELL',
        amount: ccy.toFixed(2),
        rate: buyRate.toFixed(6),
        ccyAmount: ccy.neg().toFixed(2),
        plnAmount: plnGain.toFixed(2),
        status: 'POSTED',
      } as any);
      await txRepo.save(tx);

      return {
        ok: true,
        type: 'SELL',
        currency,
        amount,
        rateDate: rate.rateDate,
        rate: rate.buy,
        gainPLN: Number(plnGain.toFixed(2)),
        // newBalancePLN: ...
      };
    });
  }
}
