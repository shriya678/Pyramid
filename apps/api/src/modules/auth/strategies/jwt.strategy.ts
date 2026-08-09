import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import type { JwtPayload } from '../tokens.service';

/**
 * Shape hydrated onto `req.user` by Passport after successful JWT verification.
 * Downstream guards/handlers can rely on this being present.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  fullName: string;
  isGuest: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not set');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * Runs after the token's signature + expiry are already verified. Loads the
   * user fresh from the DB so a deleted / disabled user's still-valid JWT is
   * rejected within one access-token lifetime (15 min max).
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        isGuest: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return user;
  }
}
