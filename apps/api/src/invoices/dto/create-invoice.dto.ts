import { IsDateString, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateInvoiceDto {
  @IsUUID()
  clientId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  number!: string;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  issueDate!: string;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate!: string;

  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  amountAr!: string;
}
