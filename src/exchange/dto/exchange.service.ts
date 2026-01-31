import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Wallet } from '../../entities/wallet.entity';
import { WalletCurrencyBalanceEntity } from '../../entities/wallet-currency-balance.entity';
import { Transaction } from '../../entities/transaction.entity';
import { ExchangeRateEntity } from '../../entities/exchange-rate.entity';
import { ExchangeDto } from '../dto/exchange.dto';

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

    return this.dataSource.transaction(async (manager) => {
      const walletRepo = manager.getRepository(Wallet);
      const balanceRepo = manager.getRepository(WalletCurrencyBalanceEntity);
      const txRepo = manager.getRepository(Transaction);
      const rateRepo = manager.getRepository(ExchangeRateEntity);

      // 1) wallet
      const wallet = await walletRepo.findOne({ where: { userId: uid } });
      if (!wallet) throw new BadRequestException('Wallet not found');

      // 2) kurs
      const rate = await this.getLatestRate(currency, rateRepo);
      const costPLN = amount * rate.buy;

      // 3) sprawdzamy PLN
      const walletPLN = Number(wallet.balancePLN);
      if (!Number.isFinite(walletPLN)) throw new BadRequestException('Invalid PLN balance in wallet');
      if (walletPLN < costPLN) throw new BadRequestException('Insufficient PLN balance');

      // 4) aktualizujemy PLN
      wallet.balancePLN = (walletPLN - costPLN).toFixed(2);
      await walletRepo.save(wallet);

      // 5) saldo waluty obcej
      let bal = await balanceRepo.findOne({
        where: { walletId: wallet.id, currencyCode: currency },
      });

      if (!bal) {
        bal = balanceRepo.create({
          walletId: wallet.id,
          currencyCode: currency,
          amount: amount.toFixed(2),
        });
      } else {
        const cur = Number(bal.amount);
        if (!Number.isFinite(cur)) throw new BadRequestException(`Invalid ${currency} balance amount`);
        bal.amount = (cur + amount).toFixed(2);
      }
      await balanceRepo.save(bal);

      // 6) transakcja
      const tx = txRepo.create({
        userId: uid,
        walletId: wallet.id,
        currencyCode: currency,
        type: 'BUY',
        amount: amount.toFixed(2),
        rate: rate.buy.toFixed(6),
      } as any);
      await txRepo.save(tx);

      return {
        ok: true,
        type: 'BUY',
        currency,
        amount,
        rateDate: rate.rateDate,
        rate: rate.buy,
        costPLN: Number(costPLN.toFixed(2)),
        newBalancePLN: Number(wallet.balancePLN),
      };
    });
  }

  async sell(userId: unknown, dto: ExchangeDto) {
    const uid = this.normalizeUserId(userId);
    const { currency, amount } = this.validateDto(dto);

    return this.dataSource.transaction(async (manager) => {
      const walletRepo = manager.getRepository(Wallet);
      const balanceRepo = manager.getRepository(WalletCurrencyBalanceEntity);
      const txRepo = manager.getRepository(Transaction);
      const rateRepo = manager.getRepository(ExchangeRateEntity);

      const wallet = await walletRepo.findOne({ where: { userId: uid } });
      if (!wallet) throw new BadRequestException('Wallet not found');

      const rate = await this.getLatestRate(currency, rateRepo);
      const gainPLN = amount * rate.sell;

      // saldo waluty obcej
      const bal = await balanceRepo.findOne({
        where: { walletId: wallet.id, currencyCode: currency },
      });
      if (!bal) throw new BadRequestException(`No ${currency} balance`);

      const cur = Number(bal.amount);
      if (!Number.isFinite(cur)) throw new BadRequestException(`Invalid ${currency} balance amount`);
      if (cur < amount) throw new BadRequestException(`Insufficient ${currency} balance`);

      // odejmujemy walutę
      bal.amount = (cur - amount).toFixed(2);
      await balanceRepo.save(bal);

      // dodajemy PLN
      const walletPLN = Number(wallet.balancePLN);
      if (!Number.isFinite(walletPLN)) throw new BadRequestException('Invalid PLN balance in wallet');

      wallet.balancePLN = (walletPLN + gainPLN).toFixed(2);
      await walletRepo.save(wallet);

      // transakcja
      const tx = txRepo.create({
        userId: uid,
        walletId: wallet.id,
        currencyCode: currency,
        type: 'SELL',
        amount: amount.toFixed(2),
        rate: rate.sell.toFixed(6),
      } as any);
      await txRepo.save(tx);

      return {
        ok: true,
        type: 'SELL',
        currency,
        amount,
        rateDate: rate.rateDate,
        rate: rate.sell,
        gainPLN: Number(gainPLN.toFixed(2)),
        newBalancePLN: Number(wallet.balancePLN),
      };
    });
  }
}
