import { IsString, Matches } from 'class-validator';

export class SetOpeningBalanceDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  asOfDate!: string;

  @IsString()
  @Matches(/^(0|[1-9]\d{0,18})$/)
  amountAr!: string;
}
