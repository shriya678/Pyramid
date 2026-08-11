import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityType,
  Priority,
  Role,
  type Prisma,
  type Task,
  type User,
  type Label,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { ProjectAccessService } from '../projects/project-access.service';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';
import type { CreateTaskDto } from './dto/create-task.dto';
import type { TaskListQueryDto } from './dto/task-list-query.dto';
import type { UpdateTaskDto } from './dto/update-task.dto';

export interface TaskAssigneeMini {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface TaskLabelMini {
  id: string;
  name: string;
  color: string;
}

export interface TaskResponse {
  id: string;
  workspaceId: string;
  projectId: string | null;
  parentTaskId: string | null;
  statusId: string;
  title: string;
  description: string | null;
  priority: Priority;
  reporterId: string;
  startDate: string | null;
  dueDate: string | null;
  orderInColumn: number;
  createdAt: string;
  updatedAt: string;
  assignees: TaskAssigneeMini[];
  labels: TaskLabelMini[];
  subtaskCount: number;
}

type TaskWithRelations = Task & {
  assignees: Array<{
    user: Pick<User, 'id' | 'username' | 'fullName' | 'avatarUrl'>;
  }>;
  labels: Array<{ label: Pick<Label, 'id' | 'name' | 'color'> }>;
  _count: { subtasks: number };
};

const INCLUDE_RELATIONS = {
  assignees: {
    select: {
      user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
    },
  },
  labels: {
    select: { label: { select: { id: true, name: true, color: true } } },
  },
  _count: { select: { subtasks: true } },
} satisfies Prisma.TaskInclude;

const toResponse = (t: TaskWithRelations): TaskResponse => ({
  id: t.id,
  workspaceId: t.workspaceId,
  projectId: t.projectId,
  parentTaskId: t.parentTaskId,
  statusId: t.statusId,
  title: t.title,
  description: t.description,
  priority: t.priority,
  reporterId: t.reporterId,
  startDate: t.startDate?.toISOString() ?? null,
  dueDate: t.dueDate?.toISOString() ?? null,
  orderInColumn: t.orderInColumn,
  createdAt: t.createdAt.toISOString(),
  updatedAt: t.updatedAt.toISOString(),
  assignees: t.assignees.map((a) => a.user),
  labels: t.labels.map((l) => l.label),
  subtaskCount: t._count.subtasks,
});

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly access: ProjectAccessService,
  ) {}

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  async list(ctx: WorkspaceContext, query: TaskListQueryDto): Promise<TaskResponse[]> {
    const where: Prisma.TaskWhereInput = { workspaceId: ctx.id };

    // Default: only top-level tasks. Explicit `any` bypasses; a specific id
    // fetches that task's direct subtasks.
    if (query.parentTaskId === undefined) {
      where.parentTaskId = null;
    } else if (query.parentTaskId !== 'any') {
      where.parentTaskId = query.parentTaskId;
    }

    if (query.q) {
      where.title = { contains: query.q, mode: 'insensitive' };
    }
    if (query.statusIds?.length) {
      where.statusId = { in: query.statusIds };
    }
    if (query.priority?.length) {
      where.priority = { in: query.priority };
    }
    // Project-visibility filter. For OWNER/ADMIN/MEMBER visible is null
    // (no filter). For COLLABORATOR, only projects they hold ProjectMember
    // for; orphan tasks (projectId=null) never visible to them.
    const visible = await this.access.getVisibleProjectIds(ctx);
    if (query.projectId === 'none') {
      if (visible !== null) return []; // COLLABORATOR: no orphans
      where.projectId = null;
    } else if (query.projectId) {
      if (visible !== null && !visible.includes(query.projectId)) return [];
      where.projectId = query.projectId;
    } else if (visible !== null) {
      if (visible.length === 0) return [];
      where.projectId = { in: visible };
    }
    if (query.labelIds?.length) {
      where.labels = { some: { labelId: { in: query.labelIds } } };
    }
    if (query.assigneeIds?.length) {
      where.assignees = { some: { userId: { in: query.assigneeIds } } };
    }
    if (query.dueBefore || query.dueAfter) {
      where.dueDate = {
        ...(query.dueBefore ? { lte: new Date(query.dueBefore) } : {}),
        ...(query.dueAfter ? { gte: new Date(query.dueAfter) } : {}),
      };
    }

    const rows = await this.prisma.task.findMany({
      where,
      orderBy: [{ statusId: 'asc' }, { orderInColumn: 'asc' }],
      include: INCLUDE_RELATIONS,
    });
    return rows.map(toResponse);
  }

  async getById(ctx: WorkspaceContext, taskId: string): Promise<TaskResponse> {
    const row = await this.loadInWorkspace(ctx, taskId);
    await this.access.assertCanAccessTask(ctx, {
      workspaceId: row.workspaceId,
      projectId: row.projectId,
    });
    return toResponse(row);
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  async create(ctx: WorkspaceContext, actorId: string, dto: CreateTaskDto): Promise<TaskResponse> {
    // COLLABORATOR must scope every task to a project they can access.
    if (ctx.role === Role.COLLABORATOR && !dto.projectId) {
      throw new ForbiddenException('Collaborators must create tasks under a project');
    }
    await this.requireStatusInWorkspace(ctx, dto.statusId);
    if (dto.projectId) await this.requireProjectInWorkspace(ctx, dto.projectId);
    if (dto.parentTaskId) await this.requireParentTaskInWorkspace(ctx, dto.parentTaskId);
    if (dto.assigneeIds?.length) {
      await this.requireAssigneesAreMembers(ctx, dto.assigneeIds);
    }
    if (dto.labelIds?.length) {
      await this.requireLabelsInWorkspace(ctx, dto.labelIds);
    }

    const orderInColumn = dto.orderInColumn ?? (await this.nextOrder(ctx.id, dto.statusId));

    const created = await this.prisma.$transaction(async (tx) => {
      const t = await tx.task.create({
        data: {
          workspaceId: ctx.id,
          projectId: dto.projectId ?? null,
          parentTaskId: dto.parentTaskId ?? null,
          statusId: dto.statusId,
          title: dto.title,
          description: dto.description ?? null,
          priority: dto.priority ?? Priority.NONE,
          reporterId: actorId,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          orderInColumn,
          assignees: dto.assigneeIds?.length
            ? { create: dto.assigneeIds.map((userId) => ({ userId })) }
            : undefined,
          labels: dto.labelIds?.length
            ? { create: dto.labelIds.map((labelId) => ({ labelId })) }
            : undefined,
        },
        include: INCLUDE_RELATIONS,
      });
      await this.activity.append(tx, {
        taskId: t.id,
        actorId,
        type: ActivityType.TASK_CREATED,
        payload: {
          title: t.title,
          statusId: t.statusId,
          projectId: t.projectId,
          parentTaskId: t.parentTaskId,
        },
      });
      return t;
    });

    return toResponse(created);
  }

  // -------------------------------------------------------------------------
  // Update
  // -------------------------------------------------------------------------

  async update(
    ctx: WorkspaceContext,
    actorId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<TaskResponse> {
    const existing = await this.loadInWorkspace(ctx, taskId);
    await this.access.assertCanAccessTask(ctx, {
      workspaceId: existing.workspaceId,
      projectId: existing.projectId,
    });

    // COLLABORATOR cannot orphan a task (dto.projectId === null clears it).
    if (ctx.role === Role.COLLABORATOR && dto.projectId === null) {
      throw new ForbiddenException('Collaborators cannot remove a task from its project');
    }

    // Validate any referenced ids before we open the transaction.
    if (dto.statusId && dto.statusId !== existing.statusId) {
      await this.requireStatusInWorkspace(ctx, dto.statusId);
    }
    if (dto.projectId) await this.requireProjectInWorkspace(ctx, dto.projectId);
    if (dto.assigneeIds) await this.requireAssigneesAreMembers(ctx, dto.assigneeIds);
    if (dto.labelIds) await this.requireLabelsInWorkspace(ctx, dto.labelIds);

    const currentAssigneeIds = new Set(existing.assignees.map((a) => a.user.id));
    const currentLabelIds = new Set(existing.labels.map((l) => l.label.id));

    const updated = await this.prisma.$transaction(async (tx) => {
      // Build scalar update payload
      const scalar: Prisma.TaskUpdateInput = {};
      if (dto.title !== undefined) scalar.title = dto.title;
      if (dto.description !== undefined) scalar.description = dto.description;
      if (dto.statusId !== undefined) {
        scalar.status = { connect: { id: dto.statusId } };
      }
      if (dto.priority !== undefined) scalar.priority = dto.priority;
      if (dto.projectId !== undefined) {
        scalar.project = dto.projectId ? { connect: { id: dto.projectId } } : { disconnect: true };
      }
      if (dto.startDate !== undefined) {
        scalar.startDate = dto.startDate ? new Date(dto.startDate) : null;
      }
      if (dto.dueDate !== undefined) {
        scalar.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      }
      if (dto.orderInColumn !== undefined) scalar.orderInColumn = dto.orderInColumn;

      // Apply the scalar update first.
      await tx.task.update({ where: { id: existing.id }, data: scalar });

      // Assignee diff — declarative replace.
      if (dto.assigneeIds) {
        const nextSet = new Set(dto.assigneeIds);
        const added = [...nextSet].filter((id) => !currentAssigneeIds.has(id));
        const removed = [...currentAssigneeIds].filter((id) => !nextSet.has(id));
        if (removed.length) {
          await tx.taskAssignee.deleteMany({
            where: { taskId: existing.id, userId: { in: removed } },
          });
        }
        if (added.length) {
          await tx.taskAssignee.createMany({
            data: added.map((userId) => ({ taskId: existing.id, userId })),
            skipDuplicates: true,
          });
        }
        for (const userId of added) {
          await this.activity.append(tx, {
            taskId: existing.id,
            actorId,
            type: ActivityType.MEMBER_ADDED,
            payload: { userId },
          });
        }
        for (const userId of removed) {
          await this.activity.append(tx, {
            taskId: existing.id,
            actorId,
            type: ActivityType.MEMBER_REMOVED,
            payload: { userId },
          });
        }
      }

      // Label diff — same pattern.
      if (dto.labelIds) {
        const nextSet = new Set(dto.labelIds);
        const added = [...nextSet].filter((id) => !currentLabelIds.has(id));
        const removed = [...currentLabelIds].filter((id) => !nextSet.has(id));
        if (removed.length) {
          await tx.taskLabel.deleteMany({
            where: { taskId: existing.id, labelId: { in: removed } },
          });
        }
        if (added.length) {
          await tx.taskLabel.createMany({
            data: added.map((labelId) => ({ taskId: existing.id, labelId })),
            skipDuplicates: true,
          });
        }
        for (const labelId of added) {
          await this.activity.append(tx, {
            taskId: existing.id,
            actorId,
            type: ActivityType.LABEL_ADDED,
            payload: { labelId },
          });
        }
        for (const labelId of removed) {
          await this.activity.append(tx, {
            taskId: existing.id,
            actorId,
            type: ActivityType.LABEL_REMOVED,
            payload: { labelId },
          });
        }
      }

      // Scalar-field activity writes.
      if (dto.statusId && dto.statusId !== existing.statusId) {
        await this.activity.append(tx, {
          taskId: existing.id,
          actorId,
          type: ActivityType.STATUS_CHANGED,
          payload: { before: existing.statusId, after: dto.statusId },
        });
      }
      if (dto.priority !== undefined && dto.priority !== existing.priority) {
        await this.activity.append(tx, {
          taskId: existing.id,
          actorId,
          type: ActivityType.PRIORITY_CHANGED,
          payload: { before: existing.priority, after: dto.priority },
        });
      }
      if (dto.dueDate !== undefined) {
        const beforeIso = existing.dueDate?.toISOString() ?? null;
        const afterIso = dto.dueDate ? new Date(dto.dueDate).toISOString() : null;
        if (beforeIso !== afterIso) {
          await this.activity.append(tx, {
            taskId: existing.id,
            actorId,
            type: ActivityType.DUE_DATE_CHANGED,
            payload: { before: beforeIso, after: afterIso },
          });
        }
      }
      if (
        (dto.title !== undefined && dto.title !== existing.title) ||
        (dto.description !== undefined && dto.description !== existing.description)
      ) {
        await this.activity.append(tx, {
          taskId: existing.id,
          actorId,
          type: ActivityType.TASK_UPDATED,
          payload: {
            ...(dto.title !== undefined
              ? { title: { before: existing.title, after: dto.title } }
              : {}),
            ...(dto.description !== undefined
              ? { description: { changed: true } } // don't log full text; keep activity payload small
              : {}),
          },
        });
      }

      // Re-fetch with relations for the response.
      return tx.task.findUniqueOrThrow({
        where: { id: existing.id },
        include: INCLUDE_RELATIONS,
      });
    });

    return toResponse(updated);
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  async delete(ctx: WorkspaceContext, taskId: string): Promise<{ ok: true }> {
    const existing = await this.loadInWorkspace(ctx, taskId);
    await this.access.assertCanAccessTask(ctx, {
      workspaceId: existing.workspaceId,
      projectId: existing.projectId,
    });
    // Subtasks cascade via schema (Task.parentTask onDelete: Cascade), same for
    // TaskAssignee / TaskLabel / Comment / Resource / Activity.
    await this.prisma.task.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async loadInWorkspace(ctx: WorkspaceContext, taskId: string): Promise<TaskWithRelations> {
    const row = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: INCLUDE_RELATIONS,
    });
    if (!row || row.workspaceId !== ctx.id) {
      throw new NotFoundException('Task not found');
    }
    return row;
  }

  private async nextOrder(workspaceId: string, statusId: string): Promise<number> {
    const last = await this.prisma.task.findFirst({
      where: { workspaceId, statusId, parentTaskId: null },
      orderBy: { orderInColumn: 'desc' },
      select: { orderInColumn: true },
    });
    return (last?.orderInColumn ?? 0) + 1000;
  }

  private async requireStatusInWorkspace(ctx: WorkspaceContext, statusId: string): Promise<void> {
    const found = await this.prisma.status.findFirst({
      where: { id: statusId, workspaceId: ctx.id },
      select: { id: true },
    });
    if (!found) throw new BadRequestException(`statusId ${statusId} is not in this workspace`);
  }

  private async requireProjectInWorkspace(ctx: WorkspaceContext, projectId: string): Promise<void> {
    const found = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId: ctx.id },
      select: { id: true },
    });
    if (!found) throw new BadRequestException(`projectId ${projectId} is not in this workspace`);
    if (ctx.role === Role.COLLABORATOR) {
      const member = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: ctx.userId } },
        select: { projectId: true },
      });
      if (!member) {
        throw new BadRequestException(`projectId ${projectId} is not accessible`);
      }
    }
  }

  private async requireParentTaskInWorkspace(
    ctx: WorkspaceContext,
    parentTaskId: string,
  ): Promise<void> {
    const found = await this.prisma.task.findFirst({
      where: { id: parentTaskId, workspaceId: ctx.id },
      select: { id: true, parentTaskId: true },
    });
    if (!found) {
      throw new BadRequestException(`parentTaskId ${parentTaskId} is not in this workspace`);
    }
    // Enforce one level of subtasks — a subtask can't itself have a parent.
    if (found.parentTaskId !== null) {
      throw new BadRequestException('Subtasks cannot themselves have subtasks (max depth 1)');
    }
  }

  private async requireAssigneesAreMembers(
    ctx: WorkspaceContext,
    userIds: string[],
  ): Promise<void> {
    if (userIds.length === 0) return;
    const members = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: ctx.id, userId: { in: userIds } },
      select: { userId: true },
    });
    const foundSet = new Set(members.map((m) => m.userId));
    const missing = userIds.filter((id) => !foundSet.has(id));
    if (missing.length) {
      throw new BadRequestException(`Assignees not in workspace: ${missing.join(', ')}`);
    }
  }

  private async requireLabelsInWorkspace(ctx: WorkspaceContext, labelIds: string[]): Promise<void> {
    if (labelIds.length === 0) return;
    const labels = await this.prisma.label.findMany({
      where: { workspaceId: ctx.id, id: { in: labelIds } },
      select: { id: true },
    });
    const foundSet = new Set(labels.map((l) => l.id));
    const missing = labelIds.filter((id) => !foundSet.has(id));
    if (missing.length) {
      throw new BadRequestException(`Labels not in workspace: ${missing.join(', ')}`);
    }
  }
}
