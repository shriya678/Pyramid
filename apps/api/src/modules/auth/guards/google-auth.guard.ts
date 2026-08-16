import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard, type IAuthModuleOptions } from '@nestjs/passport';
import type { Request } from 'express';
import type { JwtPayload } from '../tokens.service';

/**
 * Passport-google guard with optional guest-merge support.
 *
 * When the user is signed in as a guest and hits `/auth/google?merge=<jwt>`,
 * we want their existing guest user upgraded in-place after Google returns
 * — same user id, same workspace, same tasks, just with real credentials
 * attached.
 *
 * The tricky part: Google won't carry arbitrary data through the OAuth
 * dance. It DOES carry a `state` parameter for CSRF protection. We piggy-
 * back on that: we sign a short-lived JWT `{ mergeGuestId }` and pass it
 * as `state`. On callback, `AuthController.googleCallback` decodes it,
 * extracts `mergeGuestId`, and hands it to `AuthService.handleGoogleLogin`.
 *
 * Signing the state as a JWT rather than a random opaque string means:
 *   1. No server-side state store needed (works with multiple API instances).
 *   2. Tamper-proof — the state carries data, not just an id.
 *   3. Auto-expires — 10-minute TTL so a stale merge attempt can't hijack.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  private readonly logger = new Logger(GoogleAuthGuard.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  /**
   * Called by Passport before `authenticate()` is invoked. Whatever we return
   * is merged into the strategy call's options — including `state`, which
   * `passport-oauth2` forwards to the authorization URL.
   */
  getAuthenticateOptions(context: ExecutionContext): IAuthModuleOptions {
    const req = context.switchToHttp().getRequest<Request>();
    const mergeToken = req.query['merge'];
    if (!mergeToken || typeof mergeToken !== 'string') return {};

    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) return {};

    try {
      const claims = this.jwt.verify<JwtPayload>(mergeToken, { secret });
      if (!claims.isGuest || !claims.sub) {
        this.logger.warn(
          `merge token was valid JWT but not a guest session (userId=${claims.sub})`,
        );
        return {};
      }
      const state = this.jwt.sign({ mergeGuestId: claims.sub }, { secret, expiresIn: '10m' });
      return { state };
    } catch (err) {
      this.logger.warn(
        `invalid merge token — ignoring, proceeding as normal Google login: ${(err as Error).message}`,
      );
      return {};
    }
  }
}

/**
 * Payload we embed in the OAuth `state` param during a merge flow.
 * Verified by `AuthController.googleCallback` before use.
 */
export interface MergeStateClaims {
  mergeGuestId: string;
}
