import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Transaction } from "../entities/transaction.entity";

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
  ) {}

  async listForUser(userId: string) {
    const rows = await this.txRepo.find({
      where: { userId },
      // jeśli nie masz createdAt, zmień na id: "DESC"
      order: { createdAt: "DESC" as any },
      take: 100,
    });

    return rows.map((t: any) => ({
      id: t.id,
      createdAt: t.createdAt,
      type: t.type,                 // "DEPOSIT" | "BUY" | "SELL"
      currency: t.currencyCode ?? null,
      amount: Number(t.amount),
      rate: t.rate != null ? Number(t.rate) : null,
      walletId: t.walletId,
    }));
  }
}
