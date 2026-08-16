import { Injectable, Logger } from '@nestjs/common';
import { Priority, Role, type Prisma, type User, type Workspace } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_STATUSES: Array<{ name: string; color: string; order: number }> = [
  { name: 'To Do', color: '#94a3b8', order: 1000 },
  { name: 'Doing', color: '#3b82f6', order: 2000 },
  { name: 'Completed', color: '#22c55e', order: 3000 },
  { name: 'On Hold', color: '#f59e0b', order: 4000 },
];

type SeededTeammate = {
  fullName: string;
  username: string;
  title: string;
  role: Role;
};

// Three full workspace members plus one COLLABORATOR — the collaborator only
// sees the seeded demo project, giving the Members panels something realistic
// to render out of the box.
const SEEDED_TEAMMATES: SeededTeammate[] = [
  { fullName: 'Alex Chen', username: 'alex-chen', title: 'Product Designer', role: Role.MEMBER },
  {
    fullName: 'Jamie Rivera',
    username: 'jamie-rivera',
    title: 'Backend Engineer',
    role: Role.MEMBER,
  },
  { fullName: 'Sam Patel', username: 'sam-patel', title: 'QA Engineer', role: Role.MEMBER },
  {
    fullName: 'Riya Kapoor',
    username: 'riya-kapoor',
    title: 'External Contractor',
    role: Role.COLLABORATOR,
  },
];

const DEMO_PROJECT_NAME = 'Website Redesign';
const DEMO_PROJECT_DESCRIPTION =
  'Redesigning the marketing site. Riya (external contractor) is a collaborator here and only sees this project.';

/**
 * Six demo tasks spread across the four seeded statuses. The `dueDayOffset`
 * lets us produce an overdue-looking task without hard-coding a date that
 * would go stale.
 *
 *   statusName → matches the Status.name inserted above.
 *   assigneeIdx → index into SEEDED_TEAMMATES; null means no assignee.
 */
const DEMO_TASKS: Array<{
  title: string;
  statusName: string;
  priority: Priority;
  dueDayOffset: number | null;
  assigneeIdx: number | null;
  orderInColumn: number;
}> = [
  {
    title: 'Newsletter signup form',
    statusName: 'To Do',
    priority: Priority.URGENT,
    dueDayOffset: -2, // overdue
    assigneeIdx: 0, // Alex
    orderInColumn: 1000,
  },
  {
    title: 'Mobile responsive audit',
    statusName: 'To Do',
    priority: Priority.MEDIUM,
    dueDayOffset: 1, // due tomorrow
    assigneeIdx: 2, // Sam
    orderInColumn: 2000,
  },
  {
    title: 'Wireframes for hero section',
    statusName: 'Doing',
    priority: Priority.HIGH,
    dueDayOffset: 5,
    assigneeIdx: 0, // Alex
    orderInColumn: 1000,
  },
  {
    title: 'Analytics dashboard mockup',
    statusName: 'Doing',
    priority: Priority.HIGH,
    dueDayOffset: null,
    assigneeIdx: 1, // Jamie
    orderInColumn: 2000,
  },
  {
    title: 'Auth flow copy review',
    statusName: 'Completed',
    priority: Priority.LOW,
    dueDayOffset: -5,
    assigneeIdx: 3, // Riya (COLLABORATOR)
    orderInColumn: 1000,
  },
  {
    title: 'Cross-browser testing plan',
    statusName: 'On Hold',
    priority: Priority.NONE,
    dueDayOffset: null,
    assigneeIdx: 2, // Sam
    orderInColumn: 1000,
  },
];

export interface ProvisionCoreOptions {
  /** Explicit workspace name. Falls back to `"<FirstName>'s Workspace"`. */
  name?: string;
  /** Explicit slug seed for the unique-slug generator. Falls back to firstName. */
  slugSeed?: string;
}

/**
 * Turns a freshly-created User into a fully usable workspace. Two entry points:
 *   - `provision(user)` — full first-login flow: core + demo seed data
 *     (teammates + demo project + tasks). Used by guest login and Google
 *     first-time sign-in so the board isn't empty out of the box.
 *   - `provisionCore(user, opts?)` — bare workspace with just default
 *     statuses + owner membership + preference row. Used by the
 *     user-invoked `POST /workspaces` endpoint so the second and third
 *     workspaces a user creates don't come pre-populated with a random
 *     "Website Redesign" demo project and four fake teammates.
 */
@Injectable()
export class WorkspaceProvisioningService {
  private readonly logger = new Logger(WorkspaceProvisioningService.name);

  constructor(private readonly prisma: PrismaService) {}

  async provision(user: Pick<User, 'id' | 'fullName' | 'username'>): Promise<Workspace> {
    const workspace = await this.prisma.$transaction(async (tx) => {
      const created = await this.createCore(tx, user, {});
      await this.seedDemoContent(tx, created.id, user.id);
      return created;
    });
    this.logger.log(`Provisioned workspace ${workspace.slug} for user ${user.id} (with demo seed)`);
    return workspace;
  }

  async provisionCore(
    user: Pick<User, 'id' | 'fullName' | 'username'>,
    opts: ProvisionCoreOptions = {},
  ): Promise<Workspace> {
    const workspace = await this.prisma.$transaction((tx) => this.createCore(tx, user, opts));
    this.logger.log(`Provisioned bare workspace ${workspace.slug} for user ${user.id}`);
    return workspace;
  }

  /**
   * Workspace + owner membership + default statuses + preference upsert. Runs
   * inside a caller-supplied transaction so the demo seed (if any) shares the
   * same atomic scope.
   */
  private async createCore(
    tx: Prisma.TransactionClient,
    user: Pick<User, 'id' | 'fullName' | 'username'>,
    opts: ProvisionCoreOptions,
  ): Promise<Workspace> {
    const firstName = user.fullName.split(' ')[0] || user.username;
    const name = opts.name?.trim() || `${firstName}'s Workspace`;
    const slug = await this.uniqueSlug(opts.slugSeed ?? name);

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

    // Upsert: re-provisioning is possible for an existing user whose original
    // workspace was deleted. Their UserPreference row survives that deletion,
    // so a fresh create would violate the userId unique constraint. Preserve
    // whatever theme/accent they had.
    await tx.userPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });

    return created;
  }

  /**
   * Fake teammates + a demo project + 6 demo tasks. Only used on first-login
   * provisioning — user-created workspaces stay clean.
   */
  private async seedDemoContent(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    ownerUserId: string,
  ): Promise<void> {
    // Seeded teammates + their memberships. Marked isSeeded so we can tell
    // them apart from real users (and skip them in "invite by email" flows).
    const seededUsers = await Promise.all(
      SEEDED_TEAMMATES.map((t) =>
        tx.user.create({
          data: {
            email: `${t.username}-${workspaceId}@seed.local`,
            username: `${t.username}-${suffix()}`,
            fullName: t.fullName,
            title: t.title,
            isSeeded: true,
            avatarUrl: `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(t.username)}`,
            memberships: {
              create: { workspaceId, role: t.role },
            },
          } satisfies Prisma.UserCreateInput,
        }),
      ),
    );

    const demoProject = await tx.project.create({
      data: {
        workspaceId,
        name: DEMO_PROJECT_NAME,
        description: DEMO_PROJECT_DESCRIPTION,
        priority: Priority.MEDIUM,
        orderIndex: 1000,
      },
    });

    const collaborator = seededUsers.find((_, i) => SEEDED_TEAMMATES[i].role === Role.COLLABORATOR);
    if (collaborator) {
      await tx.projectMember.create({
        data: {
          projectId: demoProject.id,
          userId: collaborator.id,
          addedById: ownerUserId,
        },
      });
    }

    const statusRows = await tx.status.findMany({
      where: { workspaceId },
      select: { id: true, name: true },
    });
    const statusByName = new Map(statusRows.map((s) => [s.name, s.id]));
    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    for (const t of DEMO_TASKS) {
      const statusId = statusByName.get(t.statusName);
      if (!statusId) continue;
      const assignee = t.assigneeIdx !== null ? seededUsers[t.assigneeIdx] : null;
      await tx.task.create({
        data: {
          workspaceId,
          projectId: demoProject.id,
          statusId,
          title: t.title,
          priority: t.priority,
          reporterId: ownerUserId,
          dueDate: t.dueDayOffset !== null ? new Date(nowMs + t.dueDayOffset * dayMs) : null,
          orderInColumn: t.orderInColumn,
          assignees: assignee ? { create: { userId: assignee.id } } : undefined,
        },
      });
    }
  }

  private async uniqueSlug(seed: string): Promise<string> {
    const base =
      seed
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24) || 'workspace';
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? base : `${base}-${suffix()}`;
      const clash = await this.prisma.workspace.findUnique({ where: { slug: candidate } });
      if (!clash) return candidate;
    }
    return `${base}-${suffix(8)}`;
  }
}

function suffix(len = 5): string {
  return Math.random()
    .toString(36)
    .slice(2, 2 + len);
}
