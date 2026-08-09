import { Priority } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  /** Must reference a workspace member (validated in the service). */
  @IsOptional()
  @IsString()
  leadUserId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /** Same fractional-index trick as Status.order. Optional — service appends. */
  @IsOptional()
  @IsNumber()
  orderIndex?: number;
}
