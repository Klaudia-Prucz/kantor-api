import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { WalletCurrencyBalanceEntity } from './wallet-currency-balance.entity';

@Entity({ name: 'wallets' })
export class Wallet {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'user_id', type: 'bigint', unique: true })
  userId!: string;

  @Column({
    name: 'balance_pln',
    type: 'numeric',
    precision: 12,
    scale: 2,
    default: 0,
  })
  balancePLN!: string;

  @OneToMany(() => WalletCurrencyBalanceEntity, (b) => b.wallet)
  balances!: WalletCurrencyBalanceEntity[];

  @OneToOne(() => User, (user) => user.wallet, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
