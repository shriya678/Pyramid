import { SetMetadata } from '@nestjs/common';

/** Metadata key read by JwtAuthGuard to skip authentication. */
export const IS_PUBLIC_KEY = 'auth:public';

/**
 * Marks a route (or controller) as anonymously accessible. Everything else
 * requires a valid Bearer JWT thanks to the globally-registered JwtAuthGuard.
 *
 * Use on: /auth/guest, /auth/refresh, /health, /debug/*.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
