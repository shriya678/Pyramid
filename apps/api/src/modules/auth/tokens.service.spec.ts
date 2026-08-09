/* eslint-disable @typescript-eslint/require-await -- mock implementations
   satisfy async signatures without actually awaiting; that's the point. */
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import type { PrismaService } from '../../prisma/prisma.service';
import { TokensService } from './tokens.service';

// Small in-memory Prisma double. Only implements what TokensService touches.
// Enough to prove rotation, revocation, and expiry semantics without touching
// a real database.

interface Row {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

interface UserRow {
  id: string;
  isGuest: boolean;
}

interface MockPrisma {
  refreshToken: {
    create: (args: { data: Omit<Row, 'id' | 'revokedAt'> }) => Promise<Row>;
    findUnique: (args: { where: { tokenHash: string } }) => Promise<Row | null>;
    update: (args: { where: { id: string }; data: Partial<Row> }) => Promise<Row>;
    updateMany: (args: { where: Partial<Row>; data: Partial<Row> }) => Promise<{ count: number }>;
  };
  user: {
    findUniqueOrThrow: (args: { where: { id: string } }) => Promise<UserRow>;
  };
  $transaction: <T>(cb: (tx: MockPrisma) => Promise<T>) => Promise<T>;
  __rows: Row[];
}

function makeMockPrisma(): MockPrisma {
  const rows: Row[] = [];
  const users: UserRow[] = [{ id: 'user-1', isGuest: true }];

  const prisma: MockPrisma = {
    refreshToken: {
      create: async ({ data }) => {
        const row: Row = { id: `row-${rows.length + 1}`, ...data, revokedAt: null };
        rows.push(row);
        return row;
      },
      findUnique: async ({ where }) => rows.find((r) => r.tokenHash === where.tokenHash) ?? null,
      update: async ({ where, data }) => {
        const row = rows.find((r) => r.id === where.id);
        if (!row) throw new Error('row not found');
        Object.assign(row, data);
        return row;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const row of rows) {
          if (
            (where.tokenHash === undefined || row.tokenHash === where.tokenHash) &&
            (where.revokedAt === null ? row.revokedAt === null : true)
          ) {
            Object.assign(row, data);
            count++;
          }
        }
        return { count };
      },
    },
    user: {
      findUniqueOrThrow: async ({ where }) => {
        const u = users.find((x) => x.id === where.id);
        if (!u) throw new Error('user not found');
        return u;
      },
    },
    $transaction: async (cb) => cb(prisma),
    __rows: rows,
  };
  return prisma;
}

const sha256 = (raw: string): string => createHash('sha256').update(raw).digest('hex');

describe('TokensService', () => {
  let service: TokensService;
  let prisma: MockPrisma;
  let jwt: JwtService;

  beforeEach(() => {
    prisma = makeMockPrisma();
    jwt = new JwtService({ secret: 'test-secret-for-tokens-service' });
    const config = {
      get: (key: string): string | undefined => {
        if (key === 'JWT_ACCESS_TTL') return '15m';
        if (key === 'JWT_REFRESH_TTL') return '30d';
        return undefined;
      },
    } as unknown as ConfigService;

    service = new TokensService(jwt, config, prisma as unknown as PrismaService);
  });

  describe('issue', () => {
    it('returns an access JWT that decodes back to the user id', async () => {
      const tokens = await service.issue({ id: 'user-1', isGuest: true });
      expect(tokens.accessToken).toBeTruthy();
      expect(tokens.refreshToken).toHaveLength(64); // 48 bytes base64url
      const decoded = jwt.verify<{ sub: string; isGuest: boolean }>(tokens.accessToken);
      expect(decoded.sub).toBe('user-1');
      expect(decoded.isGuest).toBe(true);
    });

    it('persists the refresh as a sha256 hash, not the raw value', async () => {
      const tokens = await service.issue({ id: 'user-1', isGuest: true });
      expect(prisma.__rows).toHaveLength(1);
      expect(prisma.__rows[0].tokenHash).toBe(sha256(tokens.refreshToken));
      expect(prisma.__rows[0].tokenHash).not.toBe(tokens.refreshToken);
    });

    it('sets refresh expiry ~30 days out', async () => {
      const tokens = await service.issue({ id: 'user-1', isGuest: true });
      const expiresAt = new Date(tokens.refreshTokenExpiresAt).getTime();
      const now = Date.now();
      const diffDays = (expiresAt - now) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThan(29.9);
      expect(diffDays).toBeLessThan(30.1);
    });
  });

  describe('rotate', () => {
    it('returns fresh tokens and revokes the old row', async () => {
      const first = await service.issue({ id: 'user-1', isGuest: true });
      const rotated = await service.rotate(first.refreshToken);
      expect(rotated.refreshToken).not.toBe(first.refreshToken);
      expect(prisma.__rows).toHaveLength(2);
      const oldRow = prisma.__rows.find((r) => r.tokenHash === sha256(first.refreshToken));
      expect(oldRow?.revokedAt).toBeInstanceOf(Date);
      const newRow = prisma.__rows.find((r) => r.tokenHash === sha256(rotated.refreshToken));
      expect(newRow?.revokedAt).toBeNull();
    });

    it('rejects reuse of a rotated token', async () => {
      const first = await service.issue({ id: 'user-1', isGuest: true });
      await service.rotate(first.refreshToken);
      await expect(service.rotate(first.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an unknown token', async () => {
      await expect(service.rotate('a'.repeat(64))).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an obviously-too-short token (defense in depth)', async () => {
      await expect(service.rotate('short')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an expired token', async () => {
      const tokens = await service.issue({ id: 'user-1', isGuest: true });
      const row = prisma.__rows.find((r) => r.tokenHash === sha256(tokens.refreshToken));
      if (!row) throw new Error('setup: row not persisted');
      row.expiresAt = new Date(Date.now() - 1000);
      await expect(service.rotate(tokens.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('revoke', () => {
    it('marks the row revoked so it can no longer be rotated', async () => {
      const tokens = await service.issue({ id: 'user-1', isGuest: true });
      await service.revoke(tokens.refreshToken);
      const row = prisma.__rows[0];
      expect(row.revokedAt).toBeInstanceOf(Date);
      await expect(service.rotate(tokens.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('silently succeeds for unknown tokens (no info leak)', async () => {
      await expect(service.revoke('b'.repeat(64))).resolves.toBeUndefined();
    });
  });
});
