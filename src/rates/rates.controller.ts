import { Controller, Get } from '@nestjs/common';
import { RatesService } from './rates.service';
import { Query } from '@nestjs/common';

@Controller('rates')
export class RatesController {
  constructor(private readonly ratesService: RatesService) {}

  @Get('latest')
  async latest() {
    console.log('HIT /rates/latest');
    return this.ratesService.getLatest();
}
  @Get('ping')
  ping() {
    return { ok: true };
  }

  @Get('history')
history(
  @Query('code') code: string,
  @Query('from') from?: string,
  @Query('to') to?: string,
) {
  return this.ratesService.getHistory(code, from, to);
}
}
