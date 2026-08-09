import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateLabelDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color must be a 6-digit hex like #a855f7' })
  color?: string;
}
