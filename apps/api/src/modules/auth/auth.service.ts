import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthResponse, RefreshResponse } from './dto/auth-response.dto';
import type { GoogleProfileClaims } from './strategies/google.strategy';
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

  /**
   * Finish the Google OAuth handshake. Idempotent: if a user with this googleId
   * (or matching email) exists, reuse them; otherwise create a new User and
   * provision a workspace on the spot. Either way, issue a fresh token pair.
   *
   * Cases handled:
   *   1. Returning Google user (googleId match) → load, no side-effects.
   *   2. Existing user whose email matches but no googleId yet (e.g. someone
   *      who signed up with password) → attach googleId so future logins hit
   *      case 1 quickly. No new workspace.
   *   3. Brand new user → create User + provision workspace.
   *
   * Guest→Google merge (P1) is deliberately out of scope for this method —
   * that flow needs a guest JWT to identify the caller, which we would carry
   * through the OAuth state param. Left as a follow-up.
   */
  async handleGoogleLogin(profile: GoogleProfileClaims): Promise<AuthResponse> {
    // Case 1: fast path
    let user = await this.prisma.user.findUnique({
      where: { googleId: profile.googleId },
      select: this.userSelect,
    });

    let workspace: { id: string; slug: string; name: string } | null = null;

    if (!user) {
      // Case 2: existing user by email, attach googleId
      const byEmail = await this.prisma.user.findUnique({
        where: { email: profile.email },
        select: { id: true },
      });
      if (byEmail) {
        user = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: {
            googleId: profile.googleId,
            avatarUrl: profile.avatarUrl,
          },
          select: this.userSelect,
        });
      } else {
        // Case 3: new user, full provisioning
        user = await this.prisma.user.create({
          data: {
            googleId: profile.googleId,
            email: profile.email,
            fullName: profile.fullName,
            username: await this.uniqueUsername(profile.email),
            avatarUrl: profile.avatarUrl,
            isGuest: false,
          },
          select: this.userSelect,
        });
        const ws = await this.provisioning.provision(user);
        workspace = { id: ws.id, slug: ws.slug, name: ws.name };
      }
    }

    // For cases 1 and 2, load the primary workspace since we didn't just create one.
    if (!workspace) {
      const membership = await this.prisma.workspaceMember.findFirst({
        where: { userId: user.id },
        orderBy: { joinedAt: 'asc' },
        select: {
          workspace: { select: { id: true, slug: true, name: true } },
        },
      });
      workspace = membership?.workspace ?? null;
    }

    if (!workspace) {
      // Edge case: existing user with no workspace membership. Provision one.
      const ws = await this.provisioning.provision(user);
      workspace = { id: ws.id, slug: ws.slug, name: ws.name };
    }

    const tokens = await this.tokens.issue({ id: user.id, isGuest: user.isGuest });
    this.logger.log(`Google login: ${user.username} → ${workspace.slug}`);

    return { ...tokens, user, workspace };
  }

  refresh(rawRefresh: string): Promise<RefreshResponse> {
    return this.tokens.rotate(rawRefresh);
  }

  private readonly userSelect = {
    id: true,
    email: true,
    username: true,
    fullName: true,
    title: true,
    avatarUrl: true,
    isGuest: true,
  } as const;

  /** Derives a workspace-unique username from an email prefix. */
  private async uniqueUsername(email: string): Promise<string> {
    const base =
      email
        .split('@')[0]
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 22) || 'user';
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${randomBytes(3).toString('hex')}`;
      const clash = await this.prisma.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      });
      if (!clash) return candidate;
    }
    return `${base}-${randomBytes(6).toString('hex')}`;
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
