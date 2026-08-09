/* eslint-disable @typescript-eslint/require-await -- mock implementations
   satisfy async signatures without actually awaiting; that's the point. */
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';
import { StatusesService } from './statuses.service';

interface StatusRow {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  order: number;
  createdAt: Date;
}
interface TaskRow {
  id: string;
  workspaceId: string;
  statusId: string;
}

function makeMockPrisma() {
  const statuses: StatusRow[] = [];
  const tasks: TaskRow[] = [];
  const uniqueNameGuard = new Set<string>(); // enforces (workspaceId + name) uniqueness

  const prisma = {
    status: {
      findMany: async ({
        where,
        orderBy,
      }: {
        where: { workspaceId: string };
        orderBy?: { order: 'asc' | 'desc' };
      }) => {
        const rows = statuses.filter((s) => s.workspaceId === where.workspaceId);
        if (orderBy?.order) {
          rows.sort((a, b) => (orderBy.order === 'asc' ? a.order - b.order : b.order - a.order));
        }
        return rows;
      },
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: { workspaceId: string };
        orderBy?: { order: 'asc' | 'desc' };
      }) => {
        const rows = statuses.filter((s) => s.workspaceId === where.workspaceId);
        if (orderBy?.order === 'desc') rows.sort((a, b) => b.order - a.order);
        else if (orderBy?.order === 'asc') rows.sort((a, b) => a.order - b.order);
        return rows[0] ?? null;
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        statuses.find((s) => s.id === where.id) ?? null,
      create: async ({
        data,
      }: {
        data: { workspaceId: string; name: string; color: string; order: number };
      }) => {
        const key = `${data.workspaceId}::${data.name}`;
        if (uniqueNameGuard.has(key)) {
          const err = new Error('unique constraint');
          (err as Error & { code?: string }).code = 'P2002';
          throw err;
        }
        uniqueNameGuard.add(key);
        const row: StatusRow = { id: `st-${statuses.length + 1}`, createdAt: new Date(), ...data };
        statuses.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Omit<StatusRow, 'id' | 'createdAt'>>;
      }) => {
        const row = statuses.find((s) => s.id === where.id);
        if (!row) throw new Error('not found');
        if (data.name && data.name !== row.name) {
          const oldKey = `${row.workspaceId}::${row.name}`;
          const newKey = `${row.workspaceId}::${data.name}`;
          uniqueNameGuard.delete(oldKey);
          uniqueNameGuard.add(newKey);
        }
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = statuses.findIndex((s) => s.id === where.id);
        if (idx === -1) throw new Error('not found');
        const [removed] = statuses.splice(idx, 1);
        uniqueNameGuard.delete(`${removed.workspaceId}::${removed.name}`);
        return removed;
      },
      count: async ({ where }: { where: { workspaceId: string } }) =>
        statuses.filter((s) => s.workspaceId === where.workspaceId).length,
    },
    task: {
      count: async ({ where }: { where: { statusId: string } }) =>
        tasks.filter((t) => t.statusId === where.statusId).length,
      updateMany: async ({
        where,
        data,
      }: {
        where: { statusId: string };
        data: { statusId: string };
      }) => {
        let count = 0;
        for (const t of tasks) {
          if (t.statusId === where.statusId) {
            t.statusId = data.statusId;
            count++;
          }
        }
        return { count };
      },
    },
    $transaction: async <T>(ops: Array<Promise<T>>) => Promise.all(ops),
    __statuses: statuses,
    __tasks: tasks,
    __seed: (rows: StatusRow[], moreTasks: TaskRow[] = []) => {
      for (const r of rows) {
        statuses.push(r);
        uniqueNameGuard.add(`${r.workspaceId}::${r.name}`);
      }
      tasks.push(...moreTasks);
    },
  };
  return prisma;
}

const ownerCtx: WorkspaceContext = {
  id: 'ws-1',
  slug: 'w',
  name: 'W',
  role: Role.OWNER,
};
const memberCtx: WorkspaceContext = { ...ownerCtx, role: Role.MEMBER };

function makeStatus(id: string, order: number, workspaceId = 'ws-1'): StatusRow {
  return {
    id,
    workspaceId,
    name: `Col-${id}`,
    color: '#3b82f6',
    order,
    createdAt: new Date(),
  };
}

describe('StatusesService', () => {
  let service: StatusesService;
  let prisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    prisma = makeMockPrisma();
    service = new StatusesService(prisma as unknown as PrismaService);
  });

  describe('list', () => {
    it('returns rows in ascending order for the workspace', async () => {
      prisma.__seed([makeStatus('a', 3000), makeStatus('b', 1000), makeStatus('c', 2000)]);
      const list = await service.list(ownerCtx);
      expect(list.map((s) => s.id)).toEqual(['b', 'c', 'a']);
    });

    it('never leaks statuses from another workspace', async () => {
      prisma.__seed([makeStatus('a', 1000, 'ws-1'), makeStatus('x', 1000, 'ws-other')]);
      const list = await service.list(ownerCtx);
      expect(list.map((s) => s.id)).toEqual(['a']);
    });
  });

  describe('create', () => {
    it('OWNER can create; order appended after existing max when omitted', async () => {
      prisma.__seed([makeStatus('a', 1000), makeStatus('b', 5000)]);
      const created = await service.create(ownerCtx, { name: 'New', color: '#000000' });
      expect(created.order).toBe(6000);
      expect(prisma.__statuses).toHaveLength(3);
    });

    it('MEMBER cannot create', async () => {
      await expect(
        service.create(memberCtx, { name: 'Blocked', color: '#000000' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('duplicate name in same workspace → Conflict', async () => {
      await service.create(ownerCtx, { name: 'Same', color: '#000000' });
      await expect(
        service.create(ownerCtx, { name: 'Same', color: '#111111' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('OWNER can rename', async () => {
      prisma.__seed([makeStatus('a', 1000)]);
      const updated = await service.update(ownerCtx, 'a', { name: 'Renamed' });
      expect(updated.name).toBe('Renamed');
    });

    it('MEMBER cannot update', async () => {
      prisma.__seed([makeStatus('a', 1000)]);
      await expect(service.update(memberCtx, 'a', { name: 'X' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('updating a status from another workspace → 404 (no info leak)', async () => {
      prisma.__seed([makeStatus('x', 1000, 'ws-other')]);
      await expect(service.update(ownerCtx, 'x', { name: 'Sneak' })).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('delete', () => {
    it('refuses to delete the last status in a workspace', async () => {
      prisma.__seed([makeStatus('only', 1000)]);
      await expect(service.delete(ownerCtx, 'only', undefined)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('straight-deletes a status with no tasks', async () => {
      prisma.__seed([makeStatus('a', 1000), makeStatus('b', 2000)]);
      const res = await service.delete(ownerCtx, 'a', undefined);
      expect(res.movedTasks).toBe(0);
      expect(prisma.__statuses.map((s) => s.id)).toEqual(['b']);
    });

    it('with tasks and no moveTo → Conflict', async () => {
      prisma.__seed(
        [makeStatus('a', 1000), makeStatus('b', 2000)],
        [{ id: 't1', workspaceId: 'ws-1', statusId: 'a' }],
      );
      await expect(service.delete(ownerCtx, 'a', undefined)).rejects.toBeInstanceOf(
        ConflictException,
      );
      // Nothing deleted.
      expect(prisma.__statuses).toHaveLength(2);
    });

    it('moveTo pointing at the same status → 400', async () => {
      prisma.__seed(
        [makeStatus('a', 1000), makeStatus('b', 2000)],
        [{ id: 't1', workspaceId: 'ws-1', statusId: 'a' }],
      );
      await expect(service.delete(ownerCtx, 'a', 'a')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('with tasks and valid moveTo → moves tasks and deletes', async () => {
      prisma.__seed(
        [makeStatus('a', 1000), makeStatus('b', 2000)],
        [
          { id: 't1', workspaceId: 'ws-1', statusId: 'a' },
          { id: 't2', workspaceId: 'ws-1', statusId: 'a' },
        ],
      );
      const res = await service.delete(ownerCtx, 'a', 'b');
      expect(res.movedTasks).toBe(2);
      expect(prisma.__statuses.map((s) => s.id)).toEqual(['b']);
      expect(prisma.__tasks.every((t) => t.statusId === 'b')).toBe(true);
    });

    it('cannot moveTo a status in another workspace (404)', async () => {
      prisma.__seed(
        [makeStatus('a', 1000), makeStatus('b', 2000), makeStatus('x', 1000, 'ws-other')],
        [{ id: 't1', workspaceId: 'ws-1', statusId: 'a' }],
      );
      await expect(service.delete(ownerCtx, 'a', 'x')).rejects.toMatchObject({ status: 404 });
    });

    it('MEMBER cannot delete', async () => {
      prisma.__seed([makeStatus('a', 1000), makeStatus('b', 2000)]);
      await expect(service.delete(memberCtx, 'a', undefined)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
