import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from '../entities/wallet.entity';
import { Transaction } from '../entities/transaction.entity';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet) private walletRepo: Repository<Wallet>,
    @InjectRepository(Transaction) private txRepo: Repository<Transaction>,
  ) {}

  async getWalletByUserId(userId: string) {
    const wallet = await this.walletRepo.findOne({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  async deposit(userId: string, amount: number) {
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be > 0');
    }

    const wallet = await this.getWalletByUserId(userId);

    const current = Number(wallet.balancePLN);
    wallet.balancePLN = String((current + amount).toFixed(2));
    await this.walletRepo.save(wallet);

    await this.txRepo.save(
      this.txRepo.create({
        userId,
        walletId: wallet.id,
        type: 'DEPOSIT',
        amount: String(amount.toFixed(2)),
        currencyCode: null,
        rate: null,
        createdAt: new Date(),
      }),
    );

    return wallet;
  }
}
