import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ExchangeService } from './exchange.service';
import { ExchangeDto } from '../dto/exchange.dto';

@UseGuards(JwtAuthGuard)
@Controller('exchange')
export class ExchangeController {
  constructor(private readonly exchangeService: ExchangeService) {}

  @Post('buy')
  buy(@Req() req: any, @Body() dto: ExchangeDto) {
    return this.exchangeService.buy(Number(req.user.id), dto);
  }

  @Post('sell')
  sell(@Req() req: any, @Body() dto: ExchangeDto) {
    return this.exchangeService.sell(Number(req.user.id), dto);
  }
}
