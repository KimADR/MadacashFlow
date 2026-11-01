import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateForecastExpenseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  plannedDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  amountAr?: string;
}
