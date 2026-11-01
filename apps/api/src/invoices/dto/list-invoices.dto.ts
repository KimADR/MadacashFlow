import { Type } from 'class-transformer';
import { InvoiceStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength, Matches } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination.dto';

export class ListInvoicesDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueBefore?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueAfter?: string;
}
