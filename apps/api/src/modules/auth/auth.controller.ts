import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { RefreshDto } from './dto/refresh.dto';
import type { GoogleProfileClaims } from './strategies/google.strategy';
import type { AuthenticatedUser } from './strategies/jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Creates a fresh guest user + workspace and returns tokens. No credentials
   * required. Tight rate limit — this creates DB rows per call, so a botnet
   * calling it should stall out quickly.
   */
  @Public()
  @Post('guest')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 24 * 60 * 60 * 1000 } })
  @ApiOperation({ summary: 'Create a guest session (returns access + refresh tokens)' })
  createGuest() {
    return this.authService.createGuest();
  }

  /**
   * Rotates the refresh token. Old row is revoked, new access + refresh
   * returned in one transaction.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60 * 60 * 1000 } })
  @ApiOperation({ summary: 'Rotate a refresh token, returns fresh access + refresh' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  /**
   * Revokes the given refresh token. Idempotent — succeeds even if the token
   * is unknown or already revoked (to avoid leaking token validity).
   */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a refresh token' })
  logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refreshToken);
  }

  /**
   * Returns the current authenticated user + their primary workspace. Useful
   * for the frontend to rehydrate on page reload before deciding what to render.
   */
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return the authenticated user + primary workspace' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.whoami(user);
  }

  /**
   * Kicks off the Google OAuth handshake. Passport's guard redirects the
   * browser to Google's consent screen; there's no controller body to run.
   * MUST be reached via a full page navigation (window.location =), not fetch,
   * so the browser can follow the 302 back through Google.
   */
  @Public()
  @UseGuards(AuthGuard('google'))
  @Get('google')
  @ApiOperation({ summary: 'Start the Google OAuth flow (302 to Google consent)' })
  googleAuth(): void {
    // Handled entirely by the guard's redirect. Nothing to do here.
  }

  /**
   * Google redirects here with ?code=... after the user consents. Passport's
   * guard runs the code→token exchange, calls GoogleStrategy.validate(), and
   * puts the flattened profile on req.user. We upsert/find the local user,
   * mint our own tokens, and hand the browser off to the frontend's
   * /auth/callback page with tokens in the URL query.
   *
   * Hidden from Swagger — it's not a REST endpoint end-users would call.
   */
  @Public()
  @UseGuards(AuthGuard('google'))
  @Get('google/callback')
  @ApiExcludeEndpoint()
  async googleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const profile = req.user as GoogleProfileClaims;
    const authed = await this.authService.handleGoogleLogin(profile);

    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const params = new URLSearchParams({
      token: authed.accessToken,
      refresh: authed.refreshToken,
      accessExp: authed.accessTokenExpiresAt,
      refreshExp: authed.refreshTokenExpiresAt,
    });
    res.redirect(`${frontendUrl.split(',')[0].trim()}/auth/callback?${params.toString()}`);
  }
}
