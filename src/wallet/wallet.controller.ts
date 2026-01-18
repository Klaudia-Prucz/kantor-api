import { Body, Controller, Get, Post, Req, UseGuards, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { WalletService } from "./wallet.service";
import { DepositDto } from "./dto/deposit.dto";

@UseGuards(JwtAuthGuard)
@Controller("wallet")
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get("me")
  async me(@Req() req: Request) {
    const u: any = (req as any).user;
    const raw = u?.userId ?? u?.id ?? u?.sub;
    if (!raw) throw new UnauthorizedException("No user in request");

    return this.walletService.getOrCreateByUserId(String(raw));
  }

  @Post("deposit")
  async deposit(@Req() req: Request, @Body() body: DepositDto) {
    const u: any = (req as any).user;
    const raw = u?.userId ?? u?.id ?? u?.sub;
    if (!raw) throw new UnauthorizedException("No user in request");

    return this.walletService.depositPLN(String(raw), body.amountPLN);
  }
}
