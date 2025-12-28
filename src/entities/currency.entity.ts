import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'currencies' })
export class CurrencyEntity {
  @PrimaryColumn({ type: 'varchar', length: 3 })
  code!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  name!: string | null;
}
