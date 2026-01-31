import { Entity, PrimaryGeneratedColumn, Column, OneToOne } from 'typeorm';
import { Wallet } from './wallet.entity';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

    @Column({ name: "first_name", type: "varchar", length: 80 })
  firstName!: string;

  @Column({ name: "last_name", type: "varchar", length: 80 })
  lastName!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  @Column({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @OneToOne(() => Wallet, (wallet) => wallet.user)
  wallet!: Wallet;
}
