import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateForecastExpenseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  plannedDate!: string;

  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  amountAr!: string;
}
