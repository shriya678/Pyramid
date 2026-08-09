import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, type VerifyCallback } from 'passport-google-oauth20';

/**
 * Minimal identity we extract from Google's userinfo. Passed to
 * AuthService.handleGoogleLogin(), which decides whether to upsert or reuse
 * a User row.
 */
export interface GoogleProfileClaims {
  googleId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(config: ConfigService) {
    const clientID = config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET');
    const callbackURL = config.get<string>('GOOGLE_CALLBACK_URL');
    if (!clientID || !clientSecret || !callbackURL) {
      // Fail fast at boot rather than at first request. Missing creds mean the
      // strategy will silently 500 later, which is much harder to debug.
      throw new Error(
        'Google OAuth env is incomplete. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL.',
      );
    }
    super({
      clientID,
      clientSecret,
      callbackURL,
      scope: ['email', 'profile'],
    });
  }

  /**
   * Called by Passport after the OAuth2 code exchange succeeds. We flatten the
   * Google profile into our own shape so downstream code doesn't have to know
   * about Passport's structure.
   */
  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      this.logger.warn(`Google profile ${profile.id} returned no email`);
      done(new Error('Google account has no email associated'), false);
      return;
    }
    const claims: GoogleProfileClaims = {
      googleId: profile.id,
      email,
      fullName: profile.displayName || email.split('@')[0],
      avatarUrl: profile.photos?.[0]?.value ?? null,
    };
    // First arg is the error, second is what Passport puts on req.user.
    done(null, claims);
  }
}
