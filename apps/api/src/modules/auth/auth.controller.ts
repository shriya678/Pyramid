import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { RefreshDto } from './dto/refresh.dto';
import type { AuthenticatedUser } from './strategies/jwt.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
}
