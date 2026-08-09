import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthResponse, RefreshResponse } from './dto/auth-response.dto';
import type { AuthenticatedUser } from './strategies/jwt.strategy';
import { TokensService } from './tokens.service';
import { WorkspaceProvisioningService } from './workspace-provisioning.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly provisioning: WorkspaceProvisioningService,
  ) {}

  /**
   * Creates a fresh guest user + workspace and returns tokens ready to store.
   * Guest cleanup cron (30-day TTL) deletes them + their workspace when they
   * lapse.
   */
  async createGuest(): Promise<AuthResponse> {
    const uniqueId = randomUUID(); // guaranteed-unique piece of the email
    const shortId = randomBytes(4).toString('hex'); // 8 chars, human-typeable
    const user = await this.prisma.user.create({
      data: {
        email: `guest-${uniqueId}@guest.local`,
        username: `guest-${shortId}`,
        fullName: `Guest ${shortId.toUpperCase()}`,
        isGuest: true,
        avatarUrl: `https://api.dicebear.com/9.x/avataaars/svg?seed=${uniqueId}`,
      },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        title: true,
        avatarUrl: true,
        isGuest: true,
      },
    });

    const workspace = await this.provisioning.provision(user);
    const tokens = await this.tokens.issue({ id: user.id, isGuest: user.isGuest });

    this.logger.log(`Guest ${user.username} created; workspace=${workspace.slug}`);

    return {
      ...tokens,
      user,
      workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name },
    };
  }

  refresh(rawRefresh: string): Promise<RefreshResponse> {
    return this.tokens.rotate(rawRefresh);
  }

  async logout(rawRefresh: string): Promise<{ ok: true }> {
    await this.tokens.revoke(rawRefresh);
    return { ok: true };
  }

  /**
   * Whoami — returns the passthrough user plus a resolved workspace (their
   * first/primary membership). Small convenience so the frontend can hydrate
   * a page load without a second request.
   */
  async whoami(
    user: AuthenticatedUser,
  ): Promise<AuthResponse['user'] & { primaryWorkspace: AuthResponse['workspace'] | null }> {
    const row = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        title: true,
        avatarUrl: true,
        isGuest: true,
        memberships: {
          take: 1,
          orderBy: { joinedAt: 'asc' },
          select: {
            workspace: { select: { id: true, slug: true, name: true } },
          },
        },
      },
    });
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      fullName: row.fullName,
      title: row.title,
      avatarUrl: row.avatarUrl,
      isGuest: row.isGuest,
      primaryWorkspace: row.memberships[0]?.workspace ?? null,
    };
  }
}
