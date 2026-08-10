import { Priority } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  /** Required — every task lives in a column. Must be a status in the same workspace. */
  @IsString()
  statusId!: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;

  /** null / omitted = workspace-level task, no project. */
  @IsOptional()
  @IsString()
  projectId?: string;

  /** Set for subtasks. Parent must be in the same workspace. */
  @IsOptional()
  @IsString()
  parentTaskId?: string;

  /** Zero or more workspace-member userIds. Duplicates rejected. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  assigneeIds?: string[];

  /** Zero or more workspace label ids. Duplicates rejected. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  labelIds?: string[];

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  /** Same fractional-index trick as statuses/projects. Optional — service appends. */
  @IsOptional()
  @IsNumber()
  orderInColumn?: number;
}
