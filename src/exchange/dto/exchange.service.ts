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

  private normalizeCurrency(code: string) {
    return (code ?? '').trim().toUpperCase();
  }

  private validateDto(dto: ExchangeDto) {
    const currency = this.normalizeCurrency(dto.currency);
    if (!currency || currency.length !== 3) throw new BadRequestException('Invalid currency code');
    if (currency === 'PLN') throw new BadRequestException('Use DEPOSIT for PLN');
    if (typeof dto.amount !== 'number' || !Number.isFinite(dto.amount) || dto.amount <= 0) {
      throw new BadRequestException('amount must be a positive number');
    }
    return { currency, amount: dto.amount };
  }

  private async getLatestRate(currency: string, managerRepo?: Repository<ExchangeRateEntity>) {
    const repo = managerRepo ?? this.rateRepo;

    // bierzemy ostatnią datę z DB
    const latest = await repo
      .createQueryBuilder('r')
      .select('MAX(r.rateDate)', 'max')
      .getRawOne<{ max: string | null }>();

    const latestDate = latest?.max;
    if (!latestDate) throw new BadRequestException('No rates in DB. Call /rates/latest first.');

    const row = await repo.findOne({ where: { currencyCode: currency, rateDate: latestDate } });
    if (!row) throw new BadRequestException(`No rate for ${currency} at ${latestDate}`);

    return { rateDate: latestDate, buy: Number(row.buyRate), sell: Number(row.sellRate) };
  }

  async buy(userId: number, dto: ExchangeDto) {
    const { currency, amount } = this.validateDto(dto);

    return this.dataSource.transaction(async (manager) => {
      const walletRepo = manager.getRepository(Wallet);
      const balanceRepo = manager.getRepository(WalletCurrencyBalanceEntity);
      const txRepo = manager.getRepository(Transaction);
      const rateRepo = manager.getRepository(ExchangeRateEntity);

      // 1) wallet (blokada na czas transakcji)
      const wallet = await walletRepo.findOne({ where: { userId: String(userId) } });
      if (!wallet) throw new BadRequestException('Wallet not found');

      // 2) kurs
      const rate = await this.getLatestRate(currency, rateRepo);
      const costPLN = amount * rate.buy;

      // 3) sprawdzamy PLN
      const walletPLN = Number(wallet.balancePLN);
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
        bal.amount = (cur + amount).toFixed(2);
      }
      await balanceRepo.save(bal);

      // 6) transakcja (dopasuj pola do swojej encji Transaction!)
      const tx = txRepo.create({
        userId: String(userId), 
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

  async sell(userId: number, dto: ExchangeDto) {
    const { currency, amount } = this.validateDto(dto);

    return this.dataSource.transaction(async (manager) => {
      const walletRepo = manager.getRepository(Wallet);
      const balanceRepo = manager.getRepository(WalletCurrencyBalanceEntity);
      const txRepo = manager.getRepository(Transaction);
      const rateRepo = manager.getRepository(ExchangeRateEntity);

      const wallet = await walletRepo.findOne({ where: { userId: String(userId) } });
      if (!wallet) throw new BadRequestException('Wallet not found');

      const rate = await this.getLatestRate(currency, rateRepo);
      const gainPLN = amount * rate.sell;

      // sprawdzamy saldo waluty obcej
      const bal = await balanceRepo.findOne({
        where: { walletId: wallet.id, currencyCode: currency },
      });
      if (!bal) throw new BadRequestException(`No ${currency} balance`);
      const cur = Number(bal.amount);
      if (cur < amount) throw new BadRequestException(`Insufficient ${currency} balance`);

      // odejmujemy walutę
      bal.amount = (cur - amount).toFixed(2);
      await balanceRepo.save(bal);

      // dodajemy PLN
      const walletPLN = Number(wallet.balancePLN);
      wallet.balancePLN = (walletPLN + gainPLN).toFixed(2);
      await walletRepo.save(wallet);

      // transakcja
      const tx = txRepo.create({
        userId: String(userId), 
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
