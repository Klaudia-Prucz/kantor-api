import { Body, Controller, Post, Req, UseGuards, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ExchangeService } from './exchange.service';
import { ExchangeDto } from '../dto/exchange.dto';

@UseGuards(JwtAuthGuard)
@Controller('exchange')
export class ExchangeController {
  constructor(private readonly exchangeService: ExchangeService) {}

  private getUserId(req: any) {
    // Diagnostyka — zobaczysz raz i będziesz wiedzieć jak to ustawić w JwtStrategy
    console.log('[REQ.USER]', req?.user);

    const u = req?.user;
    const id = u?.id ?? u?.userId ?? u?.sub ?? u?.uid ?? u?.user_id;

    if (id == null) {
      // jeśli guard zadziałał, a userId nie ma — to i tak nie wykonujemy operacji
      throw new UnauthorizedException('No user id in token');
    }

    return id;
  }

  @Post('buy') // POST /exchange/buy
  buy(@Req() req: any, @Body() dto: ExchangeDto) {
    const userId = this.getUserId(req);
    return this.exchangeService.buy(userId, dto);
  }

  @Post('sell') // POST /exchange/sell
  sell(@Req() req: any, @Body() dto: ExchangeDto) {
    const userId = this.getUserId(req);
    return this.exchangeService.sell(userId, dto);
  }
}
