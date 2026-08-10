/* eslint-disable @typescript-eslint/require-await --
   mock implementations satisfy async signatures without actually awaiting; that's the
   point. Prisma-shaped methods take polymorphic `any` args by design. */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ActivityType, Priority, Role } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';
import { TasksService } from './tasks.service';

interface TaskRow {
  id: string;
  workspaceId: string;
  projectId: string | null;
  parentTaskId: string | null;
  statusId: string;
  title: string;
  description: string | null;
  priority: Priority;
  reporterId: string;
  startDate: Date | null;
  dueDate: Date | null;
  orderInColumn: number;
  createdAt: Date;
  updatedAt: Date;
}
interface AssigneeRow {
  taskId: string;
  userId: string;
}
interface LabelJoinRow {
  taskId: string;
  labelId: string;
}
interface ActivityRow {
  id: string;
  taskId: string;
  actorId: string;
  type: ActivityType;
  payload: Record<string, unknown>;
  createdAt: Date;
}

const USER_LOOKUP: Record<
  string,
  { id: string; username: string; fullName: string; avatarUrl: string | null }
> = {
  'u-alice': { id: 'u-alice', username: 'alice', fullName: 'Alice', avatarUrl: null },
  'u-bob': { id: 'u-bob', username: 'bob', fullName: 'Bob', avatarUrl: null },
  'u-carol': { id: 'u-carol', username: 'carol', fullName: 'Carol', avatarUrl: null },
};

const LABEL_LOOKUP: Record<
  string,
  { id: string; name: string; color: string; workspaceId: string }
> = {
  'lb-bug': { id: 'lb-bug', name: 'Bug', color: '#ff0000', workspaceId: 'ws-1' },
  'lb-feature': { id: 'lb-feature', name: 'Feature', color: '#00ff00', workspaceId: 'ws-1' },
  'lb-other': { id: 'lb-other', name: 'Other', color: '#000000', workspaceId: 'ws-other' },
};

interface MockPrisma {
  task: any;
  taskAssignee: any;
  taskLabel: any;
  activity: any;
  status: any;
  project: any;
  workspaceMember: any;
  label: any;
  $transaction: any;
  __tasks: TaskRow[];
  __assignees: AssigneeRow[];
  __labels: LabelJoinRow[];
  __activities: ActivityRow[];
  __seed: (t: TaskRow) => number;
  __seedAssignee: (taskId: string, userId: string) => number;
  __seedLabel: (taskId: string, labelId: string) => number;
}

function makeMockPrisma(): MockPrisma {
  const tasks: TaskRow[] = [];
  const assignees: AssigneeRow[] = [];
  const labels: LabelJoinRow[] = [];
  const activities: ActivityRow[] = [];
  const statusesByWorkspace = new Set(['ws-1:st-todo', 'ws-1:st-doing', 'ws-other:st-x']);
  const projectsByWorkspace = new Set(['ws-1:p-1']);
  const members = new Set(['ws-1:u-alice', 'ws-1:u-bob', 'ws-1:u-carol']);
  // u-carol is a member of ws-1 but NOT ws-2; ws-other has none of these users
  let taskCounter = 1;
  let activityCounter = 1;

  const buildRelations = (t: TaskRow) => ({
    ...t,
    assignees: assignees
      .filter((a) => a.taskId === t.id)
      .map((a) => ({
        user: USER_LOOKUP[a.userId] ?? {
          id: a.userId,
          username: '?',
          fullName: '?',
          avatarUrl: null,
        },
      })),
    labels: labels
      .filter((l) => l.taskId === t.id)
      .map((l) => ({
        label: {
          id: LABEL_LOOKUP[l.labelId]?.id ?? l.labelId,
          name: LABEL_LOOKUP[l.labelId]?.name ?? '?',
          color: LABEL_LOOKUP[l.labelId]?.color ?? '#000',
        },
      })),
    _count: { subtasks: tasks.filter((c) => c.parentTaskId === t.id).length },
  });

  const applyFilter = (t: TaskRow, where: any): boolean => {
    if (where.id && t.id !== where.id) return false;
    if (where.workspaceId && t.workspaceId !== where.workspaceId) return false;
    if (where.parentTaskId === null && t.parentTaskId !== null) return false;
    if (typeof where.parentTaskId === 'string' && t.parentTaskId !== where.parentTaskId)
      return false;
    if (where.statusId?.in && !where.statusId.in.includes(t.statusId)) return false;
    if (where.priority?.in && !where.priority.in.includes(t.priority)) return false;
    if (where.projectId === null && t.projectId !== null) return false;
    if (typeof where.projectId === 'string' && t.projectId !== where.projectId) return false;
    if (where.title?.contains) {
      const needle = String(where.title.contains).toLowerCase();
      if (!t.title.toLowerCase().includes(needle)) return false;
    }
    if (where.labels?.some?.labelId?.in) {
      const has = labels.some(
        (l) => l.taskId === t.id && where.labels.some.labelId.in.includes(l.labelId),
      );
      if (!has) return false;
    }
    if (where.assignees?.some?.userId?.in) {
      const has = assignees.some(
        (a) => a.taskId === t.id && where.assignees.some.userId.in.includes(a.userId),
      );
      if (!has) return false;
    }
    return true;
  };

  const prisma: any = {
    task: {
      findMany: async ({ where }: any) => {
        const rows = tasks.filter((t) => applyFilter(t, where));
        return rows.map(buildRelations);
      },
      findFirst: async ({ where }: any) => tasks.find((t) => applyFilter(t, where)) ?? null,
      findUnique: async ({ where }: any) => {
        const row = tasks.find((t) => t.id === where.id);
        return row ? buildRelations(row) : null;
      },
      findUniqueOrThrow: async ({ where }: any) => {
        const row = tasks.find((t) => t.id === where.id);
        if (!row) throw new Error('not found');
        return buildRelations(row);
      },
      create: async ({ data }: any) => {
        const row: TaskRow = {
          id: `t-${taskCounter++}`,
          workspaceId: data.workspaceId,
          projectId: data.projectId ?? null,
          parentTaskId: data.parentTaskId ?? null,
          statusId: data.statusId,
          title: data.title,
          description: data.description ?? null,
          priority: data.priority ?? Priority.NONE,
          reporterId: data.reporterId,
          startDate: data.startDate ?? null,
          dueDate: data.dueDate ?? null,
          orderInColumn: data.orderInColumn,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        tasks.push(row);
        if (data.assignees?.create) {
          for (const { userId } of data.assignees.create) {
            assignees.push({ taskId: row.id, userId });
          }
        }
        if (data.labels?.create) {
          for (const { labelId } of data.labels.create) {
            labels.push({ taskId: row.id, labelId });
          }
        }
        return buildRelations(row);
      },
      update: async ({ where, data }: any) => {
        const row = tasks.find((t) => t.id === where.id);
        if (!row) throw new Error('not found');
        if ('title' in data) row.title = data.title;
        if ('description' in data) row.description = data.description;
        if ('priority' in data) row.priority = data.priority;
        if ('orderInColumn' in data) row.orderInColumn = data.orderInColumn;
        if ('startDate' in data) row.startDate = data.startDate;
        if ('dueDate' in data) row.dueDate = data.dueDate;
        if ('status' in data) row.statusId = data.status.connect.id;
        if ('project' in data) {
          if (data.project?.connect) row.projectId = data.project.connect.id;
          else if (data.project?.disconnect) row.projectId = null;
        }
        row.updatedAt = new Date();
        return row;
      },
      delete: async ({ where }: any) => {
        const idx = tasks.findIndex((t) => t.id === where.id);
        if (idx === -1) throw new Error('not found');
        return tasks.splice(idx, 1)[0];
      },
    },
    taskAssignee: {
      deleteMany: async ({ where }: any) => {
        for (let i = assignees.length - 1; i >= 0; i--) {
          if (
            assignees[i].taskId === where.taskId &&
            where.userId.in.includes(assignees[i].userId)
          ) {
            assignees.splice(i, 1);
          }
        }
        return { count: 0 };
      },
      createMany: async ({ data }: any) => {
        for (const row of data) assignees.push({ taskId: row.taskId, userId: row.userId });
        return { count: data.length };
      },
    },
    taskLabel: {
      deleteMany: async ({ where }: any) => {
        for (let i = labels.length - 1; i >= 0; i--) {
          if (labels[i].taskId === where.taskId && where.labelId.in.includes(labels[i].labelId)) {
            labels.splice(i, 1);
          }
        }
        return { count: 0 };
      },
      createMany: async ({ data }: any) => {
        for (const row of data) labels.push({ taskId: row.taskId, labelId: row.labelId });
        return { count: data.length };
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
          createdAt: new Date(),
        };
        activities.push(row);
        return row;
      },
    },
    status: {
      findFirst: async ({ where }: any) => {
        const key = `${where.workspaceId}:${where.id}`;
        return statusesByWorkspace.has(key) ? { id: where.id } : null;
      },
    },
    project: {
      findFirst: async ({ where }: any) => {
        const key = `${where.workspaceId}:${where.id}`;
        return projectsByWorkspace.has(key) ? { id: where.id } : null;
      },
    },
    workspaceMember: {
      findMany: async ({ where }: any) => {
        return (where.userId.in as string[])
          .filter((u) => members.has(`${where.workspaceId}:${u}`))
          .map((userId) => ({ userId }));
      },
    },
    label: {
      findMany: async ({ where }: any) => {
        return (where.id.in as string[])
          .filter((id) => LABEL_LOOKUP[id]?.workspaceId === where.workspaceId)
          .map((id) => ({ id }));
      },
    },
    $transaction: async (cb: any) => cb(prisma),
    __tasks: tasks,
    __assignees: assignees,
    __labels: labels,
    __activities: activities,
    __seed: (t: TaskRow) => tasks.push(t),
    __seedAssignee: (taskId: string, userId: string) => assignees.push({ taskId, userId }),
    __seedLabel: (taskId: string, labelId: string) => labels.push({ taskId, labelId }),
  };
  return prisma;
}

const ws1: WorkspaceContext = { id: 'ws-1', slug: 'w', name: 'W', role: Role.OWNER };

function makeTaskRow(overrides: Partial<TaskRow>): TaskRow {
  return {
    id: overrides.id ?? 't-seed',
    workspaceId: overrides.workspaceId ?? 'ws-1',
    projectId: overrides.projectId ?? null,
    parentTaskId: overrides.parentTaskId ?? null,
    statusId: overrides.statusId ?? 'st-todo',
    title: overrides.title ?? 'Seed task',
    description: overrides.description ?? null,
    priority: overrides.priority ?? Priority.NONE,
    reporterId: overrides.reporterId ?? 'u-alice',
    startDate: overrides.startDate ?? null,
    dueDate: overrides.dueDate ?? null,
    orderInColumn: overrides.orderInColumn ?? 1000,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: overrides.updatedAt ?? new Date(),
  };
}

describe('TasksService', () => {
  let service: TasksService;
  let prisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    prisma = makeMockPrisma();
    service = new TasksService(
      prisma as unknown as PrismaService,
      new ActivityService(prisma as unknown as PrismaService),
    );
  });

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------
  describe('list', () => {
    it('defaults to top-level only (hides subtasks)', async () => {
      prisma.__seed(makeTaskRow({ id: 't-top', parentTaskId: null }));
      prisma.__seed(makeTaskRow({ id: 't-sub', parentTaskId: 't-top' }));
      const list = await service.list(ws1, {});
      expect(list.map((t) => t.id)).toEqual(['t-top']);
    });

    it('parentTaskId=<id> returns that task subtasks', async () => {
      prisma.__seed(makeTaskRow({ id: 't-top' }));
      prisma.__seed(makeTaskRow({ id: 't-sub', parentTaskId: 't-top' }));
      const list = await service.list(ws1, { parentTaskId: 't-top' });
      expect(list.map((t) => t.id)).toEqual(['t-sub']);
    });

    it('parentTaskId=any bypasses the filter', async () => {
      prisma.__seed(makeTaskRow({ id: 't-top' }));
      prisma.__seed(makeTaskRow({ id: 't-sub', parentTaskId: 't-top' }));
      const list = await service.list(ws1, { parentTaskId: 'any' });
      expect(list.map((t) => t.id).sort()).toEqual(['t-sub', 't-top']);
    });

    it('filters by statusIds', async () => {
      prisma.__seed(makeTaskRow({ id: 't-1', statusId: 'st-todo' }));
      prisma.__seed(makeTaskRow({ id: 't-2', statusId: 'st-doing' }));
      const list = await service.list(ws1, { statusIds: ['st-doing'] });
      expect(list.map((t) => t.id)).toEqual(['t-2']);
    });

    it('filters by projectId=none for tasks without a project', async () => {
      prisma.__seed(makeTaskRow({ id: 't-1', projectId: 'p-1' }));
      prisma.__seed(makeTaskRow({ id: 't-2', projectId: null }));
      const list = await service.list(ws1, { projectId: 'none' });
      expect(list.map((t) => t.id)).toEqual(['t-2']);
    });

    it('filters by q (case-insensitive title contains)', async () => {
      prisma.__seed(makeTaskRow({ id: 't-1', title: 'Add DARK MODE toggle' }));
      prisma.__seed(makeTaskRow({ id: 't-2', title: 'Fix bug' }));
      const list = await service.list(ws1, { q: 'dark' });
      expect(list.map((t) => t.id)).toEqual(['t-1']);
    });

    it('never leaks tasks from other workspaces', async () => {
      prisma.__seed(makeTaskRow({ id: 't-1', workspaceId: 'ws-1' }));
      prisma.__seed(makeTaskRow({ id: 't-x', workspaceId: 'ws-other', statusId: 'st-x' }));
      const list = await service.list(ws1, {});
      expect(list.map((t) => t.id)).toEqual(['t-1']);
    });
  });

  // ---------------------------------------------------------------------------
  // create
  // ---------------------------------------------------------------------------
  describe('create', () => {
    it('writes TASK_CREATED activity', async () => {
      const t = await service.create(ws1, 'u-alice', { title: 'X', statusId: 'st-todo' });
      expect(t.title).toBe('X');
      expect(
        prisma.__activities.filter((a) => a.taskId === t.id && a.type === 'TASK_CREATED'),
      ).toHaveLength(1);
    });

    it('rejects a statusId not in this workspace', async () => {
      await expect(
        service.create(ws1, 'u-alice', { title: 'X', statusId: 'st-x' /* belongs to ws-other */ }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an assigneeId who is not a workspace member', async () => {
      await expect(
        service.create(ws1, 'u-alice', {
          title: 'X',
          statusId: 'st-todo',
          assigneeIds: ['u-alice', 'u-notamember'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a labelId from another workspace', async () => {
      await expect(
        service.create(ws1, 'u-alice', {
          title: 'X',
          statusId: 'st-todo',
          labelIds: ['lb-other'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('enforces max subtask depth of 1', async () => {
      const parent = await service.create(ws1, 'u-alice', { title: 'Parent', statusId: 'st-todo' });
      const sub = await service.create(ws1, 'u-alice', {
        title: 'Sub',
        statusId: 'st-todo',
        parentTaskId: parent.id,
      });
      await expect(
        service.create(ws1, 'u-alice', {
          title: 'Sub of sub',
          statusId: 'st-todo',
          parentTaskId: sub.id,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates with assignees + labels', async () => {
      const t = await service.create(ws1, 'u-alice', {
        title: 'Big task',
        statusId: 'st-todo',
        assigneeIds: ['u-alice', 'u-bob'],
        labelIds: ['lb-bug', 'lb-feature'],
      });
      expect(t.assignees.map((a) => a.id).sort()).toEqual(['u-alice', 'u-bob']);
      expect(t.labels.map((l) => l.id).sort()).toEqual(['lb-bug', 'lb-feature']);
    });
  });

  // ---------------------------------------------------------------------------
  // update
  // ---------------------------------------------------------------------------
  describe('update', () => {
    it('STATUS_CHANGED activity written when statusId changes', async () => {
      prisma.__seed(makeTaskRow({ id: 't-1', statusId: 'st-todo' }));
      await service.update(ws1, 'u-alice', 't-1', { statusId: 'st-doing' });
      const acts = prisma.__activities.filter((a) => a.taskId === 't-1');
      expect(acts.some((a) => a.type === 'STATUS_CHANGED')).toBe(true);
    });

    it('no STATUS_CHANGED when status unchanged', async () => {
      prisma.__seed(makeTaskRow({ id: 't-1', statusId: 'st-todo' }));
      await service.update(ws1, 'u-alice', 't-1', { statusId: 'st-todo' });
      expect(prisma.__activities.some((a) => a.type === 'STATUS_CHANGED')).toBe(false);
    });

    it('MEMBER_ADDED + MEMBER_REMOVED activities for assignee diff', async () => {
      prisma.__seed(makeTaskRow({ id: 't-1' }));
      prisma.__seedAssignee('t-1', 'u-alice');
      prisma.__seedAssignee('t-1', 'u-bob');
      // New set: alice stays, bob removed, carol added.
      await service.update(ws1, 'u-alice', 't-1', { assigneeIds: ['u-alice', 'u-carol'] });
      const acts = prisma.__activities.filter((a) => a.taskId === 't-1');
      expect(acts.filter((a) => a.type === 'MEMBER_ADDED').map((a) => a.payload.userId)).toEqual([
        'u-carol',
      ]);
      expect(acts.filter((a) => a.type === 'MEMBER_REMOVED').map((a) => a.payload.userId)).toEqual([
        'u-bob',
      ]);
    });

    it('LABEL_ADDED / LABEL_REMOVED activities for label diff', async () => {
      prisma.__seed(makeTaskRow({ id: 't-1' }));
      prisma.__seedLabel('t-1', 'lb-bug');
      await service.update(ws1, 'u-alice', 't-1', { labelIds: ['lb-feature'] });
      const acts = prisma.__activities.filter((a) => a.taskId === 't-1');
      expect(acts.filter((a) => a.type === 'LABEL_ADDED').map((a) => a.payload.labelId)).toEqual([
        'lb-feature',
      ]);
      expect(acts.filter((a) => a.type === 'LABEL_REMOVED').map((a) => a.payload.labelId)).toEqual([
        'lb-bug',
      ]);
    });

    it('cross-workspace update → 404', async () => {
      prisma.__seed(makeTaskRow({ id: 't-x', workspaceId: 'ws-other', statusId: 'st-x' }));
      await expect(
        service.update(ws1, 'u-alice', 't-x', { title: 'Sneak' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // delete
  // ---------------------------------------------------------------------------
  describe('delete', () => {
    it('removes the task from the store', async () => {
      prisma.__seed(makeTaskRow({ id: 't-1' }));
      await service.delete(ws1, 't-1');
      expect(prisma.__tasks).toHaveLength(0);
    });

    it('cross-workspace delete → 404', async () => {
      prisma.__seed(makeTaskRow({ id: 't-x', workspaceId: 'ws-other', statusId: 'st-x' }));
      await expect(service.delete(ws1, 't-x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
