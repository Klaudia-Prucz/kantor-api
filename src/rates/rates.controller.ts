import { Controller, Get } from '@nestjs/common';
import { RatesService } from './rates.service';

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
}
