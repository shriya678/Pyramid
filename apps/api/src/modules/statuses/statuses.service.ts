import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, type Status } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';
import type { CreateStatusDto } from './dto/create-status.dto';
import type { UpdateStatusDto } from './dto/update-status.dto';

export interface StatusResponse {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  order: number;
  createdAt: string;
}

const toResponse = (s: Status): StatusResponse => ({
  id: s.id,
  workspaceId: s.workspaceId,
  name: s.name,
  color: s.color,
  order: s.order,
  createdAt: s.createdAt.toISOString(),
});

@Injectable()
export class StatusesService {
  constructor(private readonly prisma: PrismaService) {}

  /** List statuses in column order (the same order the Kanban board renders). */
  async list(ctx: WorkspaceContext): Promise<StatusResponse[]> {
    const rows = await this.prisma.status.findMany({
      where: { workspaceId: ctx.id },
      orderBy: { order: 'asc' },
    });
    return rows.map(toResponse);
  }

  async create(ctx: WorkspaceContext, dto: CreateStatusDto): Promise<StatusResponse> {
    this.requireEditor(ctx);
    // If order omitted, append after the current max so the new column lands at the end.
    let order = dto.order;
    if (order === undefined) {
      const last = await this.prisma.status.findFirst({
        where: { workspaceId: ctx.id },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      order = (last?.order ?? 0) + 1000;
    }
    try {
      const created = await this.prisma.status.create({
        data: { workspaceId: ctx.id, name: dto.name, color: dto.color, order },
      });
      return toResponse(created);
    } catch (err: unknown) {
      throw this.mapKnownError(err);
    }
  }

  async update(
    ctx: WorkspaceContext,
    statusId: string,
    dto: UpdateStatusDto,
  ): Promise<StatusResponse> {
    this.requireEditor(ctx);
    const existing = await this.loadInWorkspace(ctx, statusId);
    try {
      const updated = await this.prisma.status.update({
        where: { id: existing.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
          ...(dto.order !== undefined ? { order: dto.order } : {}),
        },
      });
      return toResponse(updated);
    } catch (err: unknown) {
      throw this.mapKnownError(err);
    }
  }

  /**
   * Delete. If the status has tasks, `moveTo` must reference another status in
   * the same workspace and tasks are moved in the same transaction as the
   * delete. If it doesn't, delete straight. Refuses to delete the last status
   * (workspace would have no columns and the board would render broken).
   */
  async delete(
    ctx: WorkspaceContext,
    statusId: string,
    moveTo: string | undefined,
  ): Promise<{ ok: true; movedTasks: number }> {
    this.requireEditor(ctx);
    const target = await this.loadInWorkspace(ctx, statusId);

    const total = await this.prisma.status.count({ where: { workspaceId: ctx.id } });
    if (total <= 1) {
      throw new ConflictException('Cannot delete the last status in a workspace');
    }

    const tasksAttached = await this.prisma.task.count({ where: { statusId: target.id } });

    if (tasksAttached === 0) {
      await this.prisma.status.delete({ where: { id: target.id } });
      return { ok: true, movedTasks: 0 };
    }

    if (!moveTo) {
      throw new ConflictException(
        `Status has ${tasksAttached} task(s) attached. Pass ?moveTo=<statusId> to reassign them before deletion.`,
      );
    }
    if (moveTo === target.id) {
      throw new BadRequestException('moveTo cannot be the same status being deleted');
    }
    const destination = await this.loadInWorkspace(ctx, moveTo);

    await this.prisma.$transaction([
      this.prisma.task.updateMany({
        where: { statusId: target.id },
        data: { statusId: destination.id },
      }),
      this.prisma.status.delete({ where: { id: target.id } }),
    ]);
    return { ok: true, movedTasks: tasksAttached };
  }

  /** Loads a status by id and verifies it belongs to the caller's workspace. */
  private async loadInWorkspace(ctx: WorkspaceContext, statusId: string): Promise<Status> {
    const row = await this.prisma.status.findUnique({ where: { id: statusId } });
    if (!row || row.workspaceId !== ctx.id) {
      // 404 (not 403) — don't confirm existence in a different workspace.
      throw new NotFoundException('Status not found');
    }
    return row;
  }

  private requireEditor(ctx: WorkspaceContext): void {
    if (ctx.role !== Role.OWNER && ctx.role !== Role.ADMIN) {
      throw new ForbiddenException('Only workspace owners or admins can modify statuses');
    }
  }

  private mapKnownError(err: unknown): Error {
    const code = (err as { code?: string }).code;
    if (code === 'P2002') {
      // Prisma unique-constraint violation → the workspace already has a
      // status with this name.
      return new ConflictException('A status with that name already exists in this workspace');
    }
    return err as Error;
  }
}
