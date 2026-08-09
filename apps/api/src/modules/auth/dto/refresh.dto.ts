import { IsString, MinLength } from 'class-validator';

/**
 * Payload for POST /auth/refresh and POST /auth/logout.
 * The token itself is opaque; we only verify basic shape here.
 */
export class RefreshDto {
  @IsString()
  @MinLength(32)
  refreshToken!: string;
}
