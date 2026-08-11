import { ResourceType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Discriminated by `type`:
 *   - LINK  → `url` required, `cloudinaryKey` / `mimeType` / `sizeBytes` ignored
 *   - FILE  → `cloudinaryKey` + `mimeType` + `sizeBytes` required (returned by
 *             Cloudinary after the browser's direct upload), `url` ignored
 *
 * `ValidateIf` gates each type-specific field on the matching `type`. Fields
 * that don't match are silently dropped by ValidationPipe's `whitelist: true`.
 */
export class CreateResourceDto {
  @IsEnum(ResourceType)
  type!: ResourceType;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  // --- LINK type ---
  @ValidateIf((o: CreateResourceDto) => o.type === ResourceType.LINK)
  @IsUrl({ require_protocol: true })
  url?: string;

  // --- FILE type ---
  @ValidateIf((o: CreateResourceDto) => o.type === ResourceType.FILE)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  cloudinaryKey?: string;

  @ValidateIf((o: CreateResourceDto) => o.type === ResourceType.FILE)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;

  /** 25 MB hard cap. Cloudinary free tier has its own quotas — this is just the API contract. */
  @ValidateIf((o: CreateResourceDto) => o.type === ResourceType.FILE)
  @IsOptional()
  @IsInt()
  @Max(25 * 1024 * 1024)
  sizeBytes?: number;
}
