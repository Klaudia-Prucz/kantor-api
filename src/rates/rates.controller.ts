import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { RatesService } from "./rates.service";

@Controller("rates")
export class RatesController {
  constructor(private readonly ratesService: RatesService) {}

  @Get("latest")
  async latest() {
    console.log("HIT /rates/latest");
    return this.ratesService.getLatest();
  }

  @Get("ping")
  ping() {
    return { ok: true };
  }

  @Get("history")
  async history(
    @Query("date") date?: string,
    @Query("code") code?: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    // ✅ tryb: /rates/history?date=YYYY-MM-DD
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new BadRequestException("Invalid date format. Use YYYY-MM-DD.");
      }
      return this.ratesService.getByDate(date);
    }

    // ✅ tryb: /rates/history?code=USD&from=...&to=...
    if (!code) {
      throw new BadRequestException("Provide 'date' or 'code'.");
    }

    return this.ratesService.getHistory(code, from, to);
  }
}
