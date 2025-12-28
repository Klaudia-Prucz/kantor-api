import { Controller, Get, Query, Req } from '@nestjs/common';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  list(@Req() req: any, @Query('limit') limit?: string) {
    const userId = req.user?.id ?? 1; // na start
    return this.transactionsService.listForUser(userId, limit ? Number(limit) : 50);
  }
}
