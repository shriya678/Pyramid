/* eslint-disable @typescript-eslint/require-await -- mock implementations
   satisfy async signatures without actually awaiting; that's the point. */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Priority, Role } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';
import type { ProjectAccessService } from './project-access.service';
import { ProjectsService } from './projects.service';

/** Permissive ProjectAccessService stub — every caller sees every project.
 *  These tests predate COLLABORATOR; project-access.service.spec.ts covers
 *  the restricted paths. */
const noopAccess = {
  getVisibleProjectIds: async () => null,
  assertCanAccessProject: async () => undefined,
  assertCanAccessTask: async () => undefined,
} as unknown as ProjectAccessService;

interface ProjectRow {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  priority: Priority;
  leadUserId: string | null;
  dueDate: Date | null;
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
}

function makeMockPrisma() {
  const projects: ProjectRow[] = [];
  const members: Array<{ userId: string; workspaceId: string }> = [
    { userId: 'user-1', workspaceId: 'ws-1' },
    { userId: 'user-2', workspaceId: 'ws-1' },
    // user-3 is NOT a member of ws-1
    { userId: 'user-3', workspaceId: 'ws-other' },
  ];
  let idCounter = 1;

  const prisma = {
    project: {
      findMany: async ({
        where,
        orderBy,
      }: {
        where: { workspaceId: string };
        orderBy?: { orderIndex: 'asc' | 'desc' };
      }) => {
        const rows = projects.filter((p) => p.workspaceId === where.workspaceId);
        if (orderBy?.orderIndex === 'asc') rows.sort((a, b) => a.orderIndex - b.orderIndex);
        return rows;
      },
      findFirst: async ({
        where,
        orderBy,
      }: {
        where: { workspaceId: string };
        orderBy?: { orderIndex: 'desc' | 'asc' };
      }) => {
        const rows = projects.filter((p) => p.workspaceId === where.workspaceId);
        if (orderBy?.orderIndex === 'desc') rows.sort((a, b) => b.orderIndex - a.orderIndex);
        return rows[0] ?? null;
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        projects.find((p) => p.id === where.id) ?? null,
      create: async ({
        data,
      }: {
        data: {
          workspaceId: string;
          name: string;
          description: string | null;
          priority: Priority;
          leadUserId: string | null;
          dueDate: Date | null;
          orderIndex: number;
        };
      }) => {
        const row: ProjectRow = {
          id: `p-${idCounter++}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        projects.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        // Prisma nested update input: leadUser might be { connect } / { disconnect } etc.
        data: Record<string, unknown>;
      }) => {
        const row = projects.find((p) => p.id === where.id);
        if (!row) throw new Error('not found');
        if ('name' in data) row.name = data.name as string;
        if ('description' in data) row.description = data.description as string | null;
        if ('priority' in data) row.priority = data.priority as Priority;
        if ('dueDate' in data) row.dueDate = data.dueDate as Date | null;
        if ('orderIndex' in data) row.orderIndex = data.orderIndex as number;
        if ('leadUser' in data) {
          const l = data.leadUser as { connect?: { id: string }; disconnect?: boolean };
          if (l.connect) row.leadUserId = l.connect.id;
          else if (l.disconnect) row.leadUserId = null;
        }
        row.updatedAt = new Date();
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = projects.findIndex((p) => p.id === where.id);
        if (idx === -1) throw new Error('not found');
        return projects.splice(idx, 1)[0];
      },
    },
    workspaceMember: {
      findFirst: async ({ where }: { where: { workspaceId: string; userId: string } }) =>
        members.find((m) => m.workspaceId === where.workspaceId && m.userId === where.userId) ??
        null,
    },
    __projects: projects,
    __seed: (rows: ProjectRow[]) => projects.push(...rows),
  };
  return prisma;
}

const owner: WorkspaceContext = {
  id: 'ws-1',
  slug: 'w',
  name: 'W',
  role: Role.OWNER,
  userId: 'user-1',
};
const member: WorkspaceContext = { ...owner, role: Role.MEMBER };

function makeProject(id: string, orderIndex: number, workspaceId = 'ws-1'): ProjectRow {
  return {
    id,
    workspaceId,
    name: `Project-${id}`,
    description: null,
    priority: Priority.NONE,
    leadUserId: null,
    dueDate: null,
    orderIndex,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('ProjectsService', () => {
  let service: ProjectsService;
  let prisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    prisma = makeMockPrisma();
    service = new ProjectsService(prisma as unknown as PrismaService, noopAccess);
  });

  describe('list', () => {
    it('returns projects in orderIndex ascending', async () => {
      prisma.__seed([makeProject('a', 3000), makeProject('b', 1000), makeProject('c', 2000)]);
      const list = await service.list(owner);
      expect(list.map((p) => p.id)).toEqual(['b', 'c', 'a']);
    });

    it('never leaks projects from another workspace', async () => {
      prisma.__seed([makeProject('a', 1000, 'ws-1'), makeProject('x', 1000, 'ws-other')]);
      const list = await service.list(owner);
      expect(list.map((p) => p.id)).toEqual(['a']);
    });
  });

  describe('create', () => {
    it('MEMBER can create (project creation is open to any member)', async () => {
      const created = await service.create(member, { name: 'From member' });
      expect(created.name).toBe('From member');
    });

    it('appends orderIndex after existing max when omitted', async () => {
      prisma.__seed([makeProject('a', 1000), makeProject('b', 5000)]);
      const created = await service.create(owner, { name: 'End' });
      expect(created.orderIndex).toBe(6000);
    });

    it('rejects a leadUserId that is not a workspace member', async () => {
      await expect(
        service.create(owner, { name: 'X', leadUserId: 'user-3' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts a leadUserId that IS a workspace member', async () => {
      const created = await service.create(owner, { name: 'Y', leadUserId: 'user-2' });
      expect(created.leadUserId).toBe('user-2');
    });
  });

  describe('update', () => {
    it('MEMBER cannot update', async () => {
      prisma.__seed([makeProject('a', 1000)]);
      await expect(service.update(member, 'a', { name: 'X' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('OWNER can rename', async () => {
      prisma.__seed([makeProject('a', 1000)]);
      const updated = await service.update(owner, 'a', { name: 'Renamed' });
      expect(updated.name).toBe('Renamed');
    });

    it('null leadUserId clears the lead', async () => {
      prisma.__seed([{ ...makeProject('a', 1000), leadUserId: 'user-1' }]);
      const updated = await service.update(owner, 'a', { leadUserId: null });
      expect(updated.leadUserId).toBeNull();
    });

    it('setting leadUserId validates workspace membership', async () => {
      prisma.__seed([makeProject('a', 1000)]);
      await expect(service.update(owner, 'a', { leadUserId: 'user-3' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('null dueDate clears the due date', async () => {
      prisma.__seed([{ ...makeProject('a', 1000), dueDate: new Date('2026-12-01') }]);
      const updated = await service.update(owner, 'a', { dueDate: null });
      expect(updated.dueDate).toBeNull();
    });

    it('cross-workspace update → 404', async () => {
      prisma.__seed([makeProject('x', 1000, 'ws-other')]);
      await expect(service.update(owner, 'x', { name: 'Sneak' })).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('delete', () => {
    it('MEMBER cannot delete', async () => {
      prisma.__seed([makeProject('a', 1000)]);
      await expect(service.delete(member, 'a')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('OWNER can delete', async () => {
      prisma.__seed([makeProject('a', 1000)]);
      await service.delete(owner, 'a');
      expect(prisma.__projects).toHaveLength(0);
    });

    it('cross-workspace delete → 404', async () => {
      prisma.__seed([makeProject('x', 1000, 'ws-other')]);
      await expect(service.delete(owner, 'x')).rejects.toMatchObject({ status: 404 });
    });
  });
});
