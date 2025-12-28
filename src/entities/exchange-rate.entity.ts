import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'exchange_rates' })
export class ExchangeRateEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'currency_code', type: 'varchar', length: 3 })
  currencyCode!: string;

  @Column({ name: 'rate_date', type: 'date' })
  rateDate!: string; // 'YYYY-MM-DD'

  @Column({ name: 'buy_rate', type: 'numeric', precision: 12, scale: 6 })
  buyRate!: string;

  @Column({ name: 'sell_rate', type: 'numeric', precision: 12, scale: 6 })
  sellRate!: string;
}
