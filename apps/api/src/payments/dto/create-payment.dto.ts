import { PaymentMethod } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreatePaymentDto {
  @IsUUID()
  clientId!: string;

  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  amountAr!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  receivedAt!: string;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
