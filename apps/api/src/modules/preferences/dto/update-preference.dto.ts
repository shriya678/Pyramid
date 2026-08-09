import { AccentColor, DefaultView, ThemeMode } from '@prisma/client';
import { IsEnum, IsObject, IsOptional } from 'class-validator';

/**
 * Any subset of preference fields. Missing = no change.
 *
 * The three *FieldsShown fields are JSON blobs like { priority: true,
 * dueDate: false, labels: true } — dynamic per-view column-visibility.
 * We don't tightly validate their shape because the frontend evolves the
 * set of toggleable columns independently of the API.
 */
export class UpdatePreferenceDto {
  @IsOptional()
  @IsEnum(ThemeMode)
  theme?: ThemeMode;

  @IsOptional()
  @IsEnum(AccentColor)
  accentColor?: AccentColor;

  @IsOptional()
  @IsEnum(DefaultView)
  defaultView?: DefaultView;

  @IsOptional()
  @IsObject()
  boardFieldsShown?: Record<string, boolean>;

  @IsOptional()
  @IsObject()
  listFieldsShown?: Record<string, boolean>;

  @IsOptional()
  @IsObject()
  projectListFieldsShown?: Record<string, boolean>;
}
