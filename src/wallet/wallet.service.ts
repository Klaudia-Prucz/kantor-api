import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Wallet } from "../entities/wallet.entity";
import { WalletCurrencyBalanceEntity } from "../entities/wallet-currency-balance.entity";
import { Transaction } from "../entities/transaction.entity";

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,

    @InjectRepository(WalletCurrencyBalanceEntity)
    private readonly balanceRepo: Repository<WalletCurrencyBalanceEntity>,
 @InjectRepository(Transaction)
private readonly txRepo: Repository<Transaction>,

  ) {}

  private async enrichWithBalances(wallet: Wallet) {
    const balances = await this.balanceRepo.find({
      where: { walletId: wallet.id },
      order: { currencyCode: "ASC" as any },
    });

    return {
      id: wallet.id,
      userId: wallet.userId,
      balancePLN: wallet.balancePLN,
      balances: balances.map((b) => ({
        currency: b.currencyCode,
        amount: b.amount,
      })),
    };
  }

  async getOrCreateByUserId(userId: string) {
    const uid = String(userId ?? "").trim();
    if (!uid) throw new BadRequestException("Missing userId");

    // ✅ jednoznaczny typ: Wallet | null
    let wallet = await this.walletRepo.findOneBy({ userId: uid });

    if (!wallet) {
      // create zwraca Wallet (nie tablicę)
      const created = this.walletRepo.create({
        userId: uid,
        balancePLN: "0.00",
      });

      wallet = await this.walletRepo.save(created);
    }

    return this.enrichWithBalances(wallet);
  }

  async depositPLN(userId: string, amountPLN: number) {
    const uid = String(userId ?? "").trim();
    if (!uid) throw new BadRequestException("Missing userId");
    if (typeof amountPLN !== "number" || !Number.isFinite(amountPLN) || amountPLN <= 0) {
      throw new BadRequestException("amountPLN must be a positive number");
    }


    const wallet = await this.walletRepo.findOneBy({ userId: uid });
    if (!wallet) throw new BadRequestException("Wallet not found");

    const cur = Number(wallet.balancePLN);
    if (!Number.isFinite(cur)) throw new BadRequestException("Invalid balancePLN");

    wallet.balancePLN = (cur + amountPLN).toFixed(2);
    await this.walletRepo.save(wallet);

    const tx = this.txRepo.create({
      userId: uid,
      walletId: wallet.id,
      type: "DEPOSIT",
      currencyCode: null,
      rate: null,
      amount: amountPLN.toFixed(2),
      plnAmount: amountPLN.toFixed(2),
      ccyAmount: null,
      status: "POSTED",
    } as any);

    await this.txRepo.save(tx);

    return this.enrichWithBalances(wallet);
  }
}
