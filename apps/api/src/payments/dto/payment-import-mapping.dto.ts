import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PaymentImportMappingDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  clientRefColumn!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  amountArColumn!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  receivedAtColumn!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  methodColumn!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceColumn?: string;
}
