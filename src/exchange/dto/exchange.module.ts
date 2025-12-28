import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ExchangeController } from './exchange.controller';
import { ExchangeService } from './exchange.service';

import { Wallet } from '../../entities/wallet.entity';
import { WalletCurrencyBalanceEntity } from '../../entities/wallet-currency-balance.entity';
import { Transaction } from '../../entities/transaction.entity';
import { ExchangeRateEntity } from '../../entities/exchange-rate.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      WalletCurrencyBalanceEntity,
      Transaction,
      ExchangeRateEntity,
    ]),
  ],
  controllers: [ExchangeController],
  providers: [ExchangeService],
})
export class ExchangeModule {}
