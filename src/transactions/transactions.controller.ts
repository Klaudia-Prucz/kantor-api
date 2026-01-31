
import { Controller, Get, UseGuards, Req, Query, BadRequestException } from "@nestjs/common";
import { TransactionsService } from "./transactions.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DataSource } from "typeorm";
import { User } from "../entities/user.entity";

@Controller("transactions")
export class TransactionsController {
  constructor(
    private readonly txService: TransactionsService,
    private readonly dataSource: DataSource,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async myTransactions(
    @Req() req: any,
    @Query("limit") limit = "50",
    @Query("offset") offset = "0",
  ) {
    // 1. Spróbuj userId bezpośrednio
    const direct = req.user?.id ?? req.user?.userId;
    if (direct && /^\d+$/.test(String(direct))) {
      return this.txService.findForUser(String(direct), {
        limit: Math.min(Math.max(Number(limit) || 50, 1), 200),
        offset: Math.max(Number(offset) || 0, 0),
      });
    }

    // 2. Spróbuj po emailu
    const email = req.user?.email;
    if (!email) {
      throw new BadRequestException("Token does not contain user id or email");
    }
    const usersRepo = this.dataSource.getRepository(User);
    const u = await usersRepo.findOne({ where: { email } });
    if (!u?.id) throw new BadRequestException("User not found for token email");
    return this.txService.findForUser(String(u.id), {
      limit: Math.min(Math.max(Number(limit) || 50, 1), 200),
      offset: Math.max(Number(offset) || 0, 0),
    });
  }
}
