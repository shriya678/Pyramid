import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityType, Prisma, Role, type Comment, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectAccessService } from '../projects/project-access.service';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';
import type { CreateCommentDto } from './dto/create-comment.dto';
import type { UpdateCommentDto } from './dto/update-comment.dto';
import { validateDoc, type ProseMirrorDoc } from './prosemirror-doc';

export interface CommentAuthorMini {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface CommentResponse {
  id: string;
  taskId: string;
  /**
   * ProseMirror JSON document (TipTap output). Legacy plain-text comments
   * were migrated to a single-paragraph doc at the schema-change migration
   * so this shape is uniform across every row.
   */
  body: ProseMirrorDoc;
  author: CommentAuthorMini;
  parentCommentId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Top-level comment with its (one level of) replies nested for rendering. */
export interface ThreadedCommentResponse extends CommentResponse {
  replies: CommentResponse[];
}

type CommentWithAuthor = Comment & {
  author: Pick<User, 'id' | 'username' | 'fullName' | 'avatarUrl'>;
};

const AUTHOR_SELECT = {
  id: true,
  username: true,
  fullName: true,
  avatarUrl: true,
} as const;

const toResponse = (c: CommentWithAuthor): CommentResponse => ({
  id: c.id,
  taskId: c.taskId,
  // Prisma types the JSONB column as `JsonValue`; we know every row is a
  // ProseMirrorDoc because the migration backfilled every legacy plain-text
  // row into that shape and new writes go through validateDoc.
  body: c.body as unknown as ProseMirrorDoc,
  author: c.author,
  parentCommentId: c.parentCommentId,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
});

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly access: ProjectAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * List all comments on a task, grouped for rendering: top-level comments in
   * chronological order, each with its replies nested (also chronological).
   */
  async listForTask(ctx: WorkspaceContext, taskId: string): Promise<ThreadedCommentResponse[]> {
    await this.requireTaskInWorkspace(ctx, taskId);
    const rows = await this.prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: AUTHOR_SELECT } },
    });

    const topLevel = rows.filter((r) => r.parentCommentId === null);
    const repliesByParent = new Map<string, CommentWithAuthor[]>();
    for (const r of rows) {
      if (r.parentCommentId) {
        const list = repliesByParent.get(r.parentCommentId) ?? [];
        list.push(r);
        repliesByParent.set(r.parentCommentId, list);
      }
    }
    return topLevel.map((t) => ({
      ...toResponse(t),
      replies: (repliesByParent.get(t.id) ?? []).map(toResponse),
    }));
  }

  async create(
    ctx: WorkspaceContext,
    actorId: string,
    taskId: string,
    dto: CreateCommentDto,
  ): Promise<CommentResponse> {
    await this.requireTaskInWorkspace(ctx, taskId);
    if (dto.parentCommentId) {
      await this.requireParentComment(taskId, dto.parentCommentId);
    }
    const doc = validateDoc(dto.body);

    const created = await this.prisma.$transaction(async (tx) => {
      const c = await tx.comment.create({
        data: {
          taskId,
          authorId: actorId,
          body: doc as unknown as Prisma.InputJsonValue,
          parentCommentId: dto.parentCommentId ?? null,
        },
        include: { author: { select: AUTHOR_SELECT } },
      });
      await this.activity.append(tx, {
        taskId,
        actorId,
        type: ActivityType.COMMENT_ADDED,
        payload: { commentId: c.id, isReply: c.parentCommentId !== null },
      });
      // Emit MENTION notifications inside the same transaction — if the
      // comment insert or the activity append fails, we don't want stale
      // notifications pointing at a comment that never existed.
      await this.notifications.emitMentions(tx, {
        actorId,
        workspaceId: ctx.id,
        taskId,
        commentId: c.id,
        body: doc,
      });
      return c;
    });
    return toResponse(created);
  }

  /**
   * Edit body. Author only — even OWNER/ADMIN can't rewrite someone else's
   * words. If they want the comment gone, they can delete it (moderation
   * allowed), but they can't put words in another user's mouth.
   */
  async update(
    ctx: WorkspaceContext,
    actorId: string,
    taskId: string,
    commentId: string,
    dto: UpdateCommentDto,
  ): Promise<CommentResponse> {
    await this.requireTaskInWorkspace(ctx, taskId);
    const existing = await this.loadCommentOnTask(taskId, commentId);
    if (existing.authorId !== actorId) {
      throw new ForbiddenException('You can only edit your own comments');
    }
    const doc = validateDoc(dto.body);
    const updated = await this.prisma.comment.update({
      where: { id: existing.id },
      data: { body: doc as unknown as Prisma.InputJsonValue },
      include: { author: { select: AUTHOR_SELECT } },
    });
    return toResponse(updated);
  }

  /**
   * Delete. Author OR workspace OWNER/ADMIN (for moderation). Replies to a
   * deleted top-level comment cascade per schema.
   */
  async delete(
    ctx: WorkspaceContext,
    actorId: string,
    taskId: string,
    commentId: string,
  ): Promise<{ ok: true }> {
    await this.requireTaskInWorkspace(ctx, taskId);
    const existing = await this.loadCommentOnTask(taskId, commentId);
    const isAuthor = existing.authorId === actorId;
    const isModerator = ctx.role === Role.OWNER || ctx.role === Role.ADMIN;
    if (!isAuthor && !isModerator) {
      throw new ForbiddenException(
        'You can only delete your own comments (or moderate as owner/admin)',
      );
    }
    await this.prisma.comment.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  private async requireTaskInWorkspace(ctx: WorkspaceContext, taskId: string): Promise<void> {
    const found = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId: ctx.id },
      select: { workspaceId: true, projectId: true },
    });
    if (!found) throw new NotFoundException('Task not found');
    await this.access.assertCanAccessTask(ctx, found);
  }

  private async requireParentComment(taskId: string, parentCommentId: string): Promise<void> {
    const parent = await this.prisma.comment.findUnique({
      where: { id: parentCommentId },
      select: { taskId: true, parentCommentId: true },
    });
    if (!parent || parent.taskId !== taskId) {
      throw new BadRequestException('parentCommentId is not on this task');
    }
    if (parent.parentCommentId !== null) {
      throw new BadRequestException('Cannot reply to a reply (comments are one level deep)');
    }
  }

  private async loadCommentOnTask(taskId: string, commentId: string): Promise<Comment> {
    const c = await this.prisma.comment.findUnique({ where: { id: commentId } });
    if (!c || c.taskId !== taskId) {
      throw new NotFoundException('Comment not found');
    }
    return c;
  }
}
