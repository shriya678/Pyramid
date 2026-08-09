import { Injectable, Logger } from '@nestjs/common';
import { Role, type Prisma, type User, type Workspace } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_STATUSES: Array<{ name: string; color: string; order: number }> = [
  { name: 'To Do', color: '#94a3b8', order: 1000 },
  { name: 'Doing', color: '#3b82f6', order: 2000 },
  { name: 'Completed', color: '#22c55e', order: 3000 },
  { name: 'On Hold', color: '#f59e0b', order: 4000 },
];

const SEEDED_TEAMMATES: Array<{ fullName: string; username: string; title: string }> = [
  { fullName: 'Alex Chen', username: 'alex-chen', title: 'Product Designer' },
  { fullName: 'Jamie Rivera', username: 'jamie-rivera', title: 'Backend Engineer' },
  { fullName: 'Sam Patel', username: 'sam-patel', title: 'QA Engineer' },
];

/**
 * Turns a freshly-created User into a fully usable workspace: their own
 * Workspace (they're OWNER), the four default Statuses so the board renders,
 * a UserPreference row with defaults, and 3 seeded fake teammates so the
 * assignee dropdown is populated from the moment they sign in.
 *
 * Called by AuthService both from the guest flow and (later) the Google flow
 * for first-time users.
 */
@Injectable()
export class WorkspaceProvisioningService {
  private readonly logger = new Logger(WorkspaceProvisioningService.name);

  constructor(private readonly prisma: PrismaService) {}

  async provision(user: Pick<User, 'id' | 'fullName' | 'username'>): Promise<Workspace> {
    const firstName = user.fullName.split(' ')[0] || user.username;
    const name = `${firstName}'s Workspace`;
    const slug = await this.uniqueSlug(firstName);

    const workspace = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: {
          name,
          slug,
          ownerId: user.id,
          members: {
            create: { userId: user.id, role: Role.OWNER },
          },
          statuses: {
            create: DEFAULT_STATUSES,
          },
        },
      });

      // Seeded teammates + their memberships. Marked isSeeded so we can tell
      // them apart from real users (and skip them in "invite by email" flows).
      await Promise.all(
        SEEDED_TEAMMATES.map((t) =>
          tx.user.create({
            data: {
              email: `${t.username}-${created.id}@seed.local`,
              username: `${t.username}-${suffix()}`,
              fullName: t.fullName,
              title: t.title,
              isSeeded: true,
              // Deterministic avatar per teammate for consistency across reloads.
              avatarUrl: `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(t.username)}`,
              memberships: {
                create: { workspaceId: created.id, role: Role.MEMBER },
              },
            } satisfies Prisma.UserCreateInput,
          }),
        ),
      );

      await tx.userPreference.create({
        data: { userId: user.id }, // all defaults per Prisma schema
      });

      return created;
    });

    this.logger.log(`Provisioned workspace ${workspace.slug} for user ${user.id}`);
    return workspace;
  }

  private async uniqueSlug(firstName: string): Promise<string> {
    const base =
      firstName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24) || 'workspace';
    // First try the plain slug, then append short random suffixes on collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${suffix()}`;
      const clash = await this.prisma.workspace.findUnique({ where: { slug: candidate } });
      if (!clash) return candidate;
    }
    // Fallback: guaranteed-unique long suffix.
    return `${base}-${suffix(8)}`;
  }
}

function suffix(len = 5): string {
  return Math.random()
    .toString(36)
    .slice(2, 2 + len);
}
