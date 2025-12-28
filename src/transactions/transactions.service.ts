import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async listForUser(userId: number, limit = 50) {
    const rows = await this.txRepo.find({
      where: { userId: String(userId) } as any,
      order: { createdAt: 'DESC' } as any,
      take: Math.min(Math.max(limit, 1), 200),
    });

    // zwracamy czytelnie
    return rows.map((t: any) => ({
      id: t.id,
      createdAt: t.createdAt,
      type: t.type,                 // DEPOSIT / BUY / SELL
      currency: t.currencyCode,     // USD / EUR / null (zależnie od Twoich zasad)
      amount: Number(t.amount),
      rate: t.rate ? Number(t.rate) : null,
      walletId: t.walletId,
    }));
  }
}
