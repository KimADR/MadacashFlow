import { IsString, MaxLength, MinLength } from 'class-validator';

export class InvoiceImportMappingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  clientRefColumn!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  numberColumn!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  issueDateColumn!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  dueDateColumn!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  amountArColumn!: string;
}
