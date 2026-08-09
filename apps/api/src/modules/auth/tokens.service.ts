import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import ms from 'ms';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * JWT payload shape carried inside the access token. Kept intentionally small —
 * this token is decoded on every request, no need for anything the DB can serve
 * on demand.
 */
export interface JwtPayload {
  sub: string; // user id
  isGuest: boolean;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string; // ISO
  refreshTokenExpiresAt: string; // ISO
}

@Injectable()
export class TokensService {
  private readonly accessTtl: string;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.accessTtl = this.config.get<string>('JWT_ACCESS_TTL') ?? '15m';
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL') ?? '30d';
    this.refreshTtlMs = ms(refreshTtl as ms.StringValue);
  }

  /**
   * Issues a fresh (access, refresh) pair for the given user and persists a
   * hashed row for the refresh half. The raw refresh is only ever returned to
   * the client — the DB holds SHA-256 of it, so a DB leak doesn't hand over
   * usable tokens.
   */
  async issue(user: Pick<User, 'id' | 'isGuest'>): Promise<IssuedTokens> {
    const payload: JwtPayload = { sub: user.id, isGuest: user.isGuest };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.accessTtl as ms.StringValue,
    });

    const rawRefresh = randomBytes(48).toString('base64url'); // 64 chars
    const tokenHash = this.hash(rawRefresh);
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    return {
      accessToken,
      refreshToken: rawRefresh,
      accessTokenExpiresAt: this.deriveAccessExpiry().toISOString(),
      refreshTokenExpiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Rotates a refresh token. Verifies the incoming raw token, revokes the row,
   * and issues a new pair. Reuse of a revoked or unknown token yields 401 —
   * the caller can decide whether that means "user needs to log in again" or
   * "possible theft".
   */
  async rotate(rawRefresh: string): Promise<IssuedTokens> {
    const row = await this.findValidByRaw(rawRefresh);
    // Revoke and issue in the same transaction so a crash between steps doesn't
    // leave two live refresh tokens (or none).
    return this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: row.id },
        data: { revokedAt: new Date() },
      });
      const user = await tx.user.findUniqueOrThrow({
        where: { id: row.userId },
        select: { id: true, isGuest: true },
      });
      // Re-use the transaction's client for the new row via a direct create.
      const rawNew = randomBytes(48).toString('base64url');
      const tokenHash = this.hash(rawNew);
      const expiresAt = new Date(Date.now() + this.refreshTtlMs);
      await tx.refreshToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });
      const accessToken = await this.jwt.signAsync(
        { sub: user.id, isGuest: user.isGuest } satisfies JwtPayload,
        { expiresIn: this.accessTtl as ms.StringValue },
      );
      return {
        accessToken,
        refreshToken: rawNew,
        accessTokenExpiresAt: this.deriveAccessExpiry().toISOString(),
        refreshTokenExpiresAt: expiresAt.toISOString(),
      };
    });
  }

  /**
   * Idempotent logout — revokes the passed refresh row if it exists and is
   * still valid. Silent success either way so we don't leak whether the token
   * was known.
   */
  async revoke(rawRefresh: string): Promise<void> {
    const tokenHash = this.hash(rawRefresh);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async findValidByRaw(rawRefresh: string) {
    if (!rawRefresh || rawRefresh.length < 32) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const tokenHash = this.hash(rawRefresh);
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    return row;
  }

  private hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private deriveAccessExpiry(): Date {
    return new Date(Date.now() + ms(this.accessTtl as ms.StringValue));
  }
}
