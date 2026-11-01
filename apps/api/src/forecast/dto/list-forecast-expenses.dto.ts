import { Type } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { ForecastExpenseStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/pagination.dto';

export class ListForecastExpensesDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ForecastExpenseStatus)
  status?: ForecastExpenseStatus;
}
