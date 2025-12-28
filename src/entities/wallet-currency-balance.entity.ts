import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Wallet } from './wallet.entity';
import { CurrencyEntity } from './currency.entity';

@Entity({ name: 'wallet_currency_balances' })
export class WalletCurrencyBalanceEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'wallet_id', type: 'bigint' })
  walletId!: string;

  @ManyToOne(() => Wallet, (w) => w.balances, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wallet_id' })
  wallet!: Wallet;

  @Column({ name: 'currency_code', type: 'varchar', length: 3 })
  currencyCode!: string;

  @ManyToOne(() => CurrencyEntity)
  @JoinColumn({ name: 'currency_code' })
  currency!: CurrencyEntity;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  amount!: string;
}
