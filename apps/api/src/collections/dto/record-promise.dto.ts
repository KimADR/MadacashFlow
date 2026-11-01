import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RecordPromiseDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  promisedDate!: string;

  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  amountAr!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
