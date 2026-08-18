/* eslint-disable @typescript-eslint/require-await --
   mock implementations satisfy async signatures without actually awaiting; that's the
   point. Prisma-shaped methods take polymorphic `any` args by design. */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActivityType, Role } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { ProjectAccessService } from '../projects/project-access.service';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';
import { CommentsService } from './comments.service';

/** Permissive stub — see projects.service.spec.ts for the rationale. */
const noopAccess = {
  getVisibleProjectIds: async () => null,
  assertCanAccessProject: async () => undefined,
  assertCanAccessTask: async () => undefined,
} as unknown as ProjectAccessService;

/** No-op stub. Notification emission is covered in notifications.service.spec.ts;
 *  here we just satisfy DI so create() doesn't crash. */
const noopNotifications = {
  emitMentions: async () => undefined,
} as unknown as NotificationsService;

/**
 * Wrap a plain string in a minimal ProseMirror doc — matches how the
 * TipTap-based composer submits simple text-only comments. Empty string
 * → empty paragraph, matching what the migration produced for legacy
 * empty rows.
 */
function docOf(text: string): Record<string, unknown> {
  return {
    type: 'doc',
    content: [
      text === ''
        ? { type: 'paragraph' }
        : { type: 'paragraph', content: [{ type: 'text', text }] },
    ],
  };
}

interface CommentRow {
  id: string;
  taskId: string;
  authorId: string;
  body: Record<string, unknown>;
  parentCommentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
interface TaskRow {
  id: string;
  workspaceId: string;
}
interface ActivityRow {
  id: string;
  taskId: string;
  actorId: string;
  type: ActivityType;
  payload: Record<string, unknown>;
}

const AUTHOR_LOOKUP: Record<
  string,
  { id: string; username: string; fullName: string; avatarUrl: string | null }
> = {
  'u-alice': { id: 'u-alice', username: 'alice', fullName: 'Alice', avatarUrl: null },
  'u-bob': { id: 'u-bob', username: 'bob', fullName: 'Bob', avatarUrl: null },
};

interface MockPrisma {
  comment: any;
  task: any;
  activity: any;
  $transaction: any;
  __comments: CommentRow[];
  __activities: ActivityRow[];
  __seed: (c: CommentRow) => number;
  __seedTask: (t: TaskRow) => number;
}

function makeMockPrisma(): MockPrisma {
  const comments: CommentRow[] = [];
  const tasks: TaskRow[] = [];
  const activities: ActivityRow[] = [];
  let commentCounter = 1;
  let activityCounter = 1;

  const buildWithAuthor = (c: CommentRow) => ({
    ...c,
    author: AUTHOR_LOOKUP[c.authorId] ?? {
      id: c.authorId,
      username: '?',
      fullName: '?',
      avatarUrl: null,
    },
  });

  const prisma: MockPrisma = {
    comment: {
      findMany: async ({ where }: any) => {
        return comments
          .filter((c) => c.taskId === where.taskId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map(buildWithAuthor);
      },
      findUnique: async ({ where }: any) => comments.find((c) => c.id === where.id) ?? null,
      create: async ({ data }: any) => {
        const row: CommentRow = {
          id: `c-${commentCounter++}`,
          taskId: data.taskId,
          authorId: data.authorId,
          body: data.body,
          parentCommentId: data.parentCommentId ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        comments.push(row);
        return buildWithAuthor(row);
      },
      update: async ({ where, data }: any) => {
        const row = comments.find((c) => c.id === where.id);
        if (!row) throw new Error('not found');
        if ('body' in data) row.body = data.body;
        row.updatedAt = new Date();
        return buildWithAuthor(row);
      },
      delete: async ({ where }: any) => {
        const idx = comments.findIndex((c) => c.id === where.id);
        if (idx === -1) throw new Error('not found');
        return comments.splice(idx, 1)[0];
      },
    },
    task: {
      findFirst: async ({ where }: any) => {
        return (
          tasks.find(
            (t) =>
              (where.id === undefined || t.id === where.id) &&
              (where.workspaceId === undefined || t.workspaceId === where.workspaceId),
          ) ?? null
        );
      },
    },
    activity: {
      create: async ({ data }: any) => {
        const row: ActivityRow = {
          id: `a-${activityCounter++}`,
          taskId: data.taskId,
          actorId: data.actorId,
          type: data.type,
          payload: data.payload,
        };
        activities.push(row);
        return row;
      },
    },
    $transaction: async (cb: any) => cb(prisma),
    __comments: comments,
    __activities: activities,
    __seed: (c) => comments.push(c),
    __seedTask: (t) => tasks.push(t),
  };
  return prisma;
}

const ws1: WorkspaceContext = {
  id: 'ws-1',
  slug: 'w',
  name: 'W',
  role: Role.OWNER,
  userId: 'user-1',
};
const memberCtx: WorkspaceContext = { ...ws1, role: Role.MEMBER };

function makeComment(overrides: Partial<CommentRow>): CommentRow {
  return {
    id: overrides.id ?? 'c-seed',
    taskId: overrides.taskId ?? 't-1',
    authorId: overrides.authorId ?? 'u-alice',
    body: overrides.body ?? docOf('seed body'),
    parentCommentId: overrides.parentCommentId ?? null,
    createdAt: overrides.createdAt ?? new Date(Date.now() - 1000),
    updatedAt: overrides.updatedAt ?? new Date(Date.now() - 1000),
  };
}

describe('CommentsService', () => {
  let service: CommentsService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makeMockPrisma();
    service = new CommentsService(
      prisma as unknown as PrismaService,
      new ActivityService(prisma as unknown as PrismaService),
      noopAccess,
      noopNotifications,
    );
    prisma.__seedTask({ id: 't-1', workspaceId: 'ws-1' });
    prisma.__seedTask({ id: 't-other', workspaceId: 'ws-other' });
  });

  // ---------------------------------------------------------------------------
  // listForTask
  // ---------------------------------------------------------------------------
  describe('listForTask', () => {
    it('returns top-level comments newest-first with replies nested chronologically', async () => {
      prisma.__seed(makeComment({ id: 'c-a', taskId: 't-1', body: docOf('top A') }));
      prisma.__seed(
        makeComment({ id: 'c-a-r1', taskId: 't-1', parentCommentId: 'c-a', body: docOf('reply') }),
      );
      prisma.__seed(makeComment({ id: 'c-b', taskId: 't-1', body: docOf('top B') }));

      const list = await service.listForTask(ws1, 't-1');
      // Top-level: newest → oldest. Seeded a-then-b, so b appears first.
      expect(list.map((c) => c.id)).toEqual(['c-b', 'c-a']);
      // Replies stay in insertion order within their thread (a's reply
      // still on a, chronological within the sub-list).
      expect(list[0].replies).toEqual([]);
      expect(list[1].replies.map((r) => r.id)).toEqual(['c-a-r1']);
    });

    it('cross-workspace task → 404', async () => {
      await expect(service.listForTask(ws1, 't-other')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  describe('create', () => {
    it('any workspace member can create a comment; writes COMMENT_ADDED activity', async () => {
      const c = await service.create(memberCtx, 'u-bob', 't-1', { body: docOf('hello') });
      expect(c.body).toEqual(docOf('hello'));
      expect(prisma.__activities.filter((a) => a.type === 'COMMENT_ADDED')).toHaveLength(1);
      expect(prisma.__activities[0].payload).toEqual({ commentId: c.id, isReply: false });
    });

    it('creating a reply — parent must be on the same task', async () => {
      prisma.__seed(makeComment({ id: 'c-parent-other', taskId: 't-other' }));
      await expect(
        service.create(ws1, 'u-alice', 't-1', {
          body: docOf('r'),
          parentCommentId: 'c-parent-other',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('cannot reply to a reply (one level only)', async () => {
      prisma.__seed(makeComment({ id: 'c-top', taskId: 't-1' }));
      prisma.__seed(makeComment({ id: 'c-reply', taskId: 't-1', parentCommentId: 'c-top' }));
      await expect(
        service.create(ws1, 'u-alice', 't-1', {
          body: docOf('nope'),
          parentCommentId: 'c-reply',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creating on a cross-workspace task → 404', async () => {
      await expect(
        service.create(ws1, 'u-alice', 't-other', { body: docOf('sneak') }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('payload marks isReply correctly', async () => {
      prisma.__seed(makeComment({ id: 'c-top', taskId: 't-1' }));
      await service.create(ws1, 'u-alice', 't-1', {
        body: docOf('reply'),
        parentCommentId: 'c-top',
      });
      const act = prisma.__activities.find((a) => a.type === 'COMMENT_ADDED');
      expect(act?.payload).toMatchObject({ isReply: true });
    });

    it('rejects an empty doc (matches old @MinLength(1) behavior)', async () => {
      await expect(
        service.create(ws1, 'u-alice', 't-1', { body: docOf('') }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a body that is not a doc node', async () => {
      await expect(
        service.create(ws1, 'u-alice', 't-1', { body: { type: 'paragraph' } }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------
  describe('update', () => {
    it('author can edit their own comment', async () => {
      prisma.__seed(
        makeComment({ id: 'c-1', taskId: 't-1', authorId: 'u-alice', body: docOf('old') }),
      );
      const updated = await service.update(ws1, 'u-alice', 't-1', 'c-1', { body: docOf('new') });
      expect(updated.body).toEqual(docOf('new'));
    });

    it('non-author cannot edit even as OWNER', async () => {
      prisma.__seed(
        makeComment({ id: 'c-1', taskId: 't-1', authorId: 'u-alice', body: docOf('old') }),
      );
      await expect(
        service.update(ws1, 'u-bob', 't-1', 'c-1', { body: docOf('rewritten') }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('comment on a different task → 404', async () => {
      prisma.__seed(makeComment({ id: 'c-x', taskId: 't-other' }));
      await expect(
        service.update(ws1, 'u-alice', 't-1', 'c-x', { body: docOf('x') }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // delete
  // ---------------------------------------------------------------------------
  describe('delete', () => {
    it('author can delete their own comment', async () => {
      prisma.__seed(makeComment({ id: 'c-1', taskId: 't-1', authorId: 'u-alice' }));
      await service.delete(ws1, 'u-alice', 't-1', 'c-1');
      expect(prisma.__comments).toHaveLength(0);
    });

    it('OWNER can moderate (delete other users comments)', async () => {
      prisma.__seed(makeComment({ id: 'c-1', taskId: 't-1', authorId: 'u-bob' }));
      await service.delete(ws1, 'u-alice', 't-1', 'c-1');
      expect(prisma.__comments).toHaveLength(0);
    });

    it('non-author non-moderator cannot delete', async () => {
      prisma.__seed(makeComment({ id: 'c-1', taskId: 't-1', authorId: 'u-alice' }));
      await expect(service.delete(memberCtx, 'u-bob', 't-1', 'c-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
