import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Wallet } from "../entities/wallet.entity";

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
  ) {}

  async getOrCreateByUserId(userId: string): Promise<Wallet> {
    try {
      const existing = await this.walletRepo.findOne({ where: { userId } });
      if (existing) return existing;

   const created = this.walletRepo.create({
  userId,
  balancePLN: "0.00",
} as any) as unknown as Wallet;


const saved = (await this.walletRepo.save(created as unknown as Wallet)) as unknown as Wallet;
return saved;

    } catch (e) {
      console.error("WALLET/me error:", e);
      throw new InternalServerErrorException("Wallet read failed");
    }
  }

  async depositPLN(userId: string, amountPLN: number) {
    if (!Number.isFinite(amountPLN) || amountPLN <= 0) {
      throw new BadRequestException("amountPLN must be > 0");
    }

    try {
      const wallet = await this.getOrCreateByUserId(userId);

      const current = Number((wallet as any).balancePLN ?? 0);
      const next = current + amountPLN;

      (wallet as any).balancePLN = next.toFixed(2);

      await this.walletRepo.save(wallet as Wallet);

      return { ok: true, balancePLN: (wallet as any).balancePLN };
    } catch (e) {
      console.error("WALLET/deposit error:", e);
      throw new InternalServerErrorException("Deposit failed");
    }
  }
}
