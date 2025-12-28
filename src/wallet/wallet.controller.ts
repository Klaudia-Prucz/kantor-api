import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private walletService: WalletService) {}

  @Get()
  getWallet(@Req() req: any) {
    return this.walletService.getWalletByUserId(req.user.userId);
  }

  @Post('deposit')
  deposit(@Req() req: any, @Body() body: { amount: number }) {
    return this.walletService.deposit(req.user.userId, Number(body.amount));
  }
}
