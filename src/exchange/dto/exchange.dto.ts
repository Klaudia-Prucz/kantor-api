import { IsNumber, IsString, Length } from 'class-validator';

export class ExchangeDto {
  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsNumber()
  amount!: number;
}
