import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MergeConflictError } from './errors';
import type { AuthResponse, RefreshResponse } from './dto/auth-response.dto';
import type { UpdateMeDto } from './dto/update-me.dto';
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
   *   0. Merge (mergeGuestId set) → upgrade the guest user in place. Throws
   *      MergeConflictError if the Google account is already used by a
   *      different real user.
   *   1. Returning Google user (googleId match) → load, no side-effects.
   *   2. Existing user whose email matches but no googleId yet (e.g. someone
   *      who signed up with password) → attach googleId so future logins hit
   *      case 1 quickly. No new workspace.
   *   3. Brand new user → create User + provision workspace.
   */
  async handleGoogleLogin(
    profile: GoogleProfileClaims,
    mergeGuestId?: string,
  ): Promise<AuthResponse> {
    // Case 0: guest → Google merge
    if (mergeGuestId) {
      return this.mergeGuestIntoGoogle(profile, mergeGuestId);
    }

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

  /**
   * Guest → Google upgrade. Same user row, same workspace, same tasks —
   * we just attach Google credentials and clear the isGuest flag.
   *
   * Fails with MergeConflictError if the Google account is already used
   * by a different real user — otherwise we'd silently take over their
   * account. The frontend's /auth/callback handles this error and asks
   * the user to sign out and use the existing Google account instead.
   *
   * Post-merge cleanup: revoke every refresh token for this user issued
   * before the merge. The new access + refresh returned to the browser
   * are what the client should carry forward — old ones are stale (the
   * user's isGuest claim changed) and would confuse the picture.
   */
  private async mergeGuestIntoGoogle(
    profile: GoogleProfileClaims,
    mergeGuestId: string,
  ): Promise<AuthResponse> {
    // 1. Verify the merge target still exists AND is still a guest.
    const guest = await this.prisma.user.findUnique({
      where: { id: mergeGuestId },
      select: { id: true, isGuest: true, email: true, username: true },
    });
    if (!guest) {
      throw new MergeConflictError('Your guest session no longer exists. Please sign in again.');
    }
    if (!guest.isGuest) {
      // Already a real user — no-op the merge and just log them in as normal.
      // Shouldn't happen if the frontend gates the merge CTA on isGuest, but
      // defensive against a stale merge token.
      this.logger.warn(`merge target ${guest.id} is no longer a guest — ignoring merge`);
      return this.handleGoogleLogin(profile);
    }

    // 2. Refuse if the Google account is already used by someone else.
    const existingGoogle = await this.prisma.user.findFirst({
      where: {
        AND: [
          { OR: [{ googleId: profile.googleId }, { email: profile.email }] },
          { id: { not: guest.id } },
        ],
      },
      select: { id: true, isGuest: true },
    });
    if (existingGoogle) {
      throw new MergeConflictError(
        'This Google account is already linked to another user. Sign out of the guest session and log in with Google directly to use that account.',
      );
    }

    // 3. Upgrade in place.
    const upgraded = await this.prisma.user.update({
      where: { id: guest.id },
      data: {
        googleId: profile.googleId,
        email: profile.email,
        fullName: profile.fullName,
        avatarUrl: profile.avatarUrl,
        isGuest: false,
      },
      select: this.userSelect,
    });

    // 4. Load the user's primary workspace (the one auto-provisioned when
    // they were a guest). Guest users always own exactly one workspace at
    // this point (they can create more later).
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId: upgraded.id },
      orderBy: { joinedAt: 'asc' },
      select: {
        workspace: { select: { id: true, slug: true, name: true } },
      },
    });
    if (!membership) {
      // Genuinely shouldn't happen — a guest is always provisioned with a
      // workspace. Defensive: provision a fresh one so we don't 500.
      const ws = await this.provisioning.provision(upgraded);
      return this.finishMerge(upgraded, { id: ws.id, slug: ws.slug, name: ws.name });
    }

    return this.finishMerge(upgraded, membership.workspace);
  }

  private async finishMerge(
    user: AuthResponse['user'],
    workspace: AuthResponse['workspace'],
  ): Promise<AuthResponse> {
    // Revoke every pre-merge refresh token — the claims baked into the old
    // access tokens (isGuest=true) are now inconsistent with the DB. Clean
    // slate.
    await this.prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const tokens = await this.tokens.issue({ id: user.id, isGuest: user.isGuest });
    this.logger.log(`Guest ${user.username} merged into Google (${user.email})`);
    return { ...tokens, user, workspace };
  }

  refresh(rawRefresh: string): Promise<RefreshResponse> {
    return this.tokens.rotate(rawRefresh);
  }

  /**
   * Update the current user's profile fields. Only the fields the caller sent
   * are touched; username uniqueness is DB-enforced and surfaced as a friendly
   * 409 if a clash is detected.
   */
  async updateProfile(userId: string, dto: UpdateMeDto): Promise<AuthResponse['user']> {
    if (dto.username) {
      const clash = await this.prisma.user.findFirst({
        where: { username: dto.username, id: { not: userId } },
        select: { id: true },
      });
      if (clash) throw new ConflictException('Username is taken');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        // Explicit spread: undefined values are dropped by Prisma, so PATCH
        // semantics (omit → don't touch) are preserved. `null` is legal for
        // title/avatarUrl so the user can clear them.
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.username !== undefined ? { username: dto.username } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
      },
      select: this.userSelect,
    });
    return updated;
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
