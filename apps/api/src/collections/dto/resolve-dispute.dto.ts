import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveDisputeDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
