import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityType, type Activity, type Prisma, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';

export interface ActivityActorMini {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface ActivityResponse {
  id: string;
  taskId: string;
  actor: ActivityActorMini;
  type: ActivityType;
  payload: unknown;
  createdAt: string;
}

type ActivityWithActor = Activity & {
  actor: Pick<User, 'id' | 'username' | 'fullName' | 'avatarUrl'>;
};

const toResponse = (a: ActivityWithActor): ActivityResponse => ({
  id: a.id,
  taskId: a.taskId,
  actor: a.actor,
  type: a.type,
  payload: a.payload,
  createdAt: a.createdAt.toISOString(),
});

/**
 * Two responsibilities:
 *   1. `append(tx, ...)` — insert an Activity row from inside a $transaction
 *      so the write is atomic with the mutation that produced it. Used by
 *      TasksService, CommentsService (this PR), and ResourcesService (next).
 *   2. `listForTask(...)` — read the feed for a task, newest first, with
 *      actor info hydrated so the frontend can render "Alice changed the
 *      priority from Low to High" without a follow-up user lookup.
 */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async append(
    tx: Pick<Prisma.TransactionClient, 'activity'>,
    input: {
      taskId: string;
      actorId: string;
      type: ActivityType;
      payload: Prisma.JsonObject;
    },
  ): Promise<void> {
    await tx.activity.create({
      data: {
        taskId: input.taskId,
        actorId: input.actorId,
        type: input.type,
        payload: input.payload,
      },
    });
  }

  /**
   * List the activity feed for a task. Newest first — matches how Task Detail
   * renders "Updates" (most recent event at the top).
   */
  async listForTask(ctx: WorkspaceContext, taskId: string): Promise<ActivityResponse[]> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId: ctx.id },
      select: { id: true },
    });
    if (!task) throw new NotFoundException('Task not found');

    const rows = await this.prisma.activity.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
      },
    });
    return rows.map(toResponse);
  }
}
