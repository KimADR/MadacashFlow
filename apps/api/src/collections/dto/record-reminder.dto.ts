import { CollectionChannel } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class RecordReminderDto {
  @IsEnum(CollectionChannel)
  channel!: CollectionChannel;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
