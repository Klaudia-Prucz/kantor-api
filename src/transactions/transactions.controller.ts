import { Controller, Get, Req, UseGuards, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { TransactionsService } from "./transactions.service";

@UseGuards(JwtAuthGuard)
@Controller("transactions")
export class TransactionsController {
  constructor(private readonly txService: TransactionsService) {}

  @Get("me")
  async me(@Req() req: Request) {
    const u: any = (req as any).user;
    const raw = u?.userId ?? u?.id ?? u?.sub;
    if (!raw) throw new UnauthorizedException("No user in request");

    return this.txService.listForUser(String(raw));
  }
}
