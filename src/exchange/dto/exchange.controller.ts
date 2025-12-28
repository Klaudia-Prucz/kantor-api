import { Body, Controller, Post, Req } from '@nestjs/common';
import { ExchangeService } from './exchange.service'; // ✅ TU
import { ExchangeDto } from './exchange.dto';     // ✅ TU

@Controller('exchange')
export class ExchangeController {
  constructor(private readonly exchangeService: ExchangeService) {}

  @Post('buy')
  buy(@Req() req: any, @Body() dto: ExchangeDto) {
  
    const userId = req.user?.id ?? 1;
    return this.exchangeService.buy(userId, dto);
  }

  @Post('sell')
  sell(@Req() req: any, @Body() dto: ExchangeDto) {
    const userId = req.user?.id ?? 1;
    return this.exchangeService.sell(userId, dto);
  }
}
