import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, type Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { extractPlainText, type ProseMirrorDoc } from '../comments/prosemirror-doc';
import { extractMentionedUsernames } from './mention-parser';

export interface NotificationActorMini {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface NotificationTaskMini {
  id: string;
  title: string;
  workspaceSlug: string;
}

export interface NotificationResponse {
  id: string;
  type: NotificationType;
  actor: NotificationActorMini;
  task: NotificationTaskMini | null;
  commentId: string | null;
  readAt: string | null;
  createdAt: string;
}

const ACTOR_SELECT = {
  id: true,
  username: true,
  fullName: true,
  avatarUrl: true,
} as const;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recent notifications for a user — unread first (via ordering by readAt
   * nulls first isn't supported cross-DB; we just sort by createdAt desc and
   * let the client render as it likes). Capped at `limit` so a pathological
   * user with 10k notifications doesn't blow the response.
   */
  async listForUser(userId: string, limit = 50): Promise<NotificationResponse[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      include: {
        actor: { select: ACTOR_SELECT },
      },
    });

    // Fetch the tasks in a batch so we can include title + workspaceSlug in
    // each notification. Cheaper than an include per row when many
    // notifications reference the same task.
    const taskIds = Array.from(
      new Set(rows.map((r) => r.taskId).filter((id): id is string => Boolean(id))),
    );
    const tasks = taskIds.length
      ? await this.prisma.task.findMany({
          where: { id: { in: taskIds } },
          select: { id: true, title: true, workspace: { select: { slug: true } } },
        })
      : [];
    const taskById = new Map(
      tasks.map((t) => [t.id, { id: t.id, title: t.title, workspaceSlug: t.workspace.slug }]),
    );

    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      actor: r.actor,
      task: r.taskId ? (taskById.get(r.taskId) ?? null) : null,
      commentId: r.commentId,
      readAt: r.readAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /**
   * Fast unread count for the header bell badge. Uses the (userId, readAt)
   * composite index so this stays constant-time.
   */
  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  /**
   * Mark one notification as read. 404 if it doesn't belong to the caller
   * (prevents information leakage — no distinction between "wrong user" and
   * "doesn't exist").
   */
  async markRead(userId: string, notificationId: string): Promise<{ ok: true }> {
    const row = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
      select: { id: true, readAt: true },
    });
    if (!row) throw new NotFoundException('Notification not found');
    if (row.readAt) return { ok: true }; // idempotent
    await this.prisma.notification.update({
      where: { id: row.id },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * Bulk mark. Cheap — hits the (userId, readAt) index directly.
   */
  async markAllRead(userId: string): Promise<{ ok: true; updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true, updated: result.count };
  }

  /**
   * Parse @mentions from a comment body and emit MENTION notifications for
   * every workspace member whose username appears. Runs inside the caller's
   * transaction so we don't send notifications for a comment that ends up
   * rolled back.
   *
   * Skipped for:
   *   - The comment author themselves (@mentioning yourself is a no-op —
   *     you wrote the comment).
   *   - Usernames that don't match any workspace member (silent — a typo
   *     shouldn't 400 the comment create).
   *   - Seeded fake teammates (`isSeeded: true`) — the demo Alex/Jamie/Sam
   *     accounts won't ever log in to see a notification anyway.
   */
  async emitMentions(
    tx: Prisma.TransactionClient,
    args: {
      actorId: string;
      workspaceId: string;
      taskId: string;
      commentId: string;
      body: ProseMirrorDoc;
    },
  ): Promise<void> {
    // Interim: flatten the doc to plain text and reuse the regex parser
    // until phase 7 replaces this with structural `type: 'mention'` node
    // detection produced by the TipTap Mention extension.
    const plainText = extractPlainText(args.body);
    const usernames = extractMentionedUsernames(plainText);
    if (usernames.length === 0) {
      // Only log when the body actually contains an @ — otherwise every
      // comment ever generates noise. Helps QA answer "why didn't my
      // mention fire" quickly.
      if (plainText.includes('@')) {
        this.logger.log(
          `emitMentions: no @username tokens matched for comment ${args.commentId} (plainText=${JSON.stringify(plainText.slice(0, 200))})`,
        );
      }
      return;
    }

    // Look up matching workspace members. Filter server-side so we don't
    // notify users outside the workspace even if they happen to share the
    // username string.
    const members = await tx.workspaceMember.findMany({
      where: {
        workspaceId: args.workspaceId,
        userId: { not: args.actorId },
        user: {
          username: { in: usernames },
          isSeeded: false,
        },
      },
      select: { userId: true, user: { select: { username: true } } },
    });
    if (members.length === 0) {
      // Common cause: the mentioned username doesn't exist in this
      // workspace, OR it belongs to a seeded fake teammate (filtered
      // out because they can't log in to read the notification).
      this.logger.log(
        `emitMentions: parsed @usernames=[${usernames.join(', ')}] but no real workspace members matched for comment ${args.commentId}`,
      );
      return;
    }

    await tx.notification.createMany({
      data: members.map((m) => ({
        userId: m.userId,
        actorId: args.actorId,
        type: NotificationType.MENTION,
        taskId: args.taskId,
        commentId: args.commentId,
      })),
    });
    this.logger.log(
      `emitMentions: delivered ${members.length} MENTION notification(s) for comment ${args.commentId} to [${members.map((m) => m.user.username).join(', ')}]`,
    );
  }
}
