import { Injectable } from '@nestjs/common';
import { ActivityType, type Prisma } from '@prisma/client';

/**
 * Small helper for appending Activity rows. Reused by TasksService now and
 * by CommentsService / ResourcesService in later PRs.
 *
 * The interesting design choice: `append` takes a Prisma client rather than
 * using PrismaService directly, so callers can pass a transaction client
 * (from prisma.$transaction) and the activity write commits atomically with
 * the mutation that produced it. If the caller passes nothing special, they
 * can pass their PrismaService instance (it satisfies the same interface).
 */
@Injectable()
export class ActivityService {
  /**
   * Insert an Activity row. Typically called inside a $transaction so the
   * activity write is atomic with the entity change that produced it.
   */
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
}
