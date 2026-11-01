import { IsString, IsUUID, Matches } from 'class-validator';

export class CreateAllocationDto {
  @IsUUID()
  invoiceId!: string;

  @IsString()
  @Matches(/^[1-9]\d{0,18}$/)
  amountAr!: string;
}
