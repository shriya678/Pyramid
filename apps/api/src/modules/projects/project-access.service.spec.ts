/* eslint-disable @typescript-eslint/require-await -- mocks satisfy async signatures without awaiting; the point of the mock is to be sync-under-the-hood. */
import { NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';
import { ProjectAccessService } from './project-access.service';

interface ProjectRow {
  id: string;
  workspaceId: string;
}
interface ProjectMemberRow {
  projectId: string;
  userId: string;
}

function makeMockPrisma() {
  const projects: ProjectRow[] = [
    { id: 'p-1', workspaceId: 'ws-1' },
    { id: 'p-2', workspaceId: 'ws-1' },
    { id: 'p-3', workspaceId: 'ws-2' }, // different workspace
  ];
  const projectMembers: ProjectMemberRow[] = [
    { projectId: 'p-1', userId: 'user-collab' }, // only sees p-1
  ];

  const prisma = {
    project: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const row = projects.find((p) => p.id === where.id);
        return row ? { workspaceId: row.workspaceId } : null;
      },
    },
    projectMember: {
      findMany: async ({
        where,
      }: {
        where: { userId: string; project: { workspaceId: string } };
      }) => {
        const projectIdsInWs = new Set(
          projects.filter((p) => p.workspaceId === where.project.workspaceId).map((p) => p.id),
        );
        return projectMembers
          .filter((m) => m.userId === where.userId && projectIdsInWs.has(m.projectId))
          .map((m) => ({ projectId: m.projectId }));
      },
      findUnique: async ({
        where,
      }: {
        where: { projectId_userId: { projectId: string; userId: string } };
      }) => {
        const row = projectMembers.find(
          (m) =>
            m.projectId === where.projectId_userId.projectId &&
            m.userId === where.projectId_userId.userId,
        );
        return row ? { projectId: row.projectId } : null;
      },
    },
  } as unknown as PrismaService;

  return { prisma, projects, projectMembers };
}

const ctxAs = (role: Role, userId = 'user-1'): WorkspaceContext => ({
  id: 'ws-1',
  slug: 'ws-1-slug',
  name: 'Workspace One',
  role,
  userId,
});

describe('ProjectAccessService', () => {
  describe('getVisibleProjectIds', () => {
    it('returns null for OWNER (no filter)', async () => {
      const { prisma } = makeMockPrisma();
      const svc = new ProjectAccessService(prisma);
      await expect(svc.getVisibleProjectIds(ctxAs(Role.OWNER))).resolves.toBeNull();
    });

    it('returns null for ADMIN (no filter)', async () => {
      const { prisma } = makeMockPrisma();
      const svc = new ProjectAccessService(prisma);
      await expect(svc.getVisibleProjectIds(ctxAs(Role.ADMIN))).resolves.toBeNull();
    });

    it('returns null for MEMBER (no filter — MEMBERs see all projects)', async () => {
      const { prisma } = makeMockPrisma();
      const svc = new ProjectAccessService(prisma);
      await expect(svc.getVisibleProjectIds(ctxAs(Role.MEMBER))).resolves.toBeNull();
    });

    it('returns only ProjectMember rows for COLLABORATOR', async () => {
      const { prisma } = makeMockPrisma();
      const svc = new ProjectAccessService(prisma);
      const ids = await svc.getVisibleProjectIds(ctxAs(Role.COLLABORATOR, 'user-collab'));
      expect(ids).toEqual(['p-1']);
    });

    it('returns [] for COLLABORATOR with no ProjectMember rows', async () => {
      const { prisma } = makeMockPrisma();
      const svc = new ProjectAccessService(prisma);
      const ids = await svc.getVisibleProjectIds(ctxAs(Role.COLLABORATOR, 'user-nobody'));
      expect(ids).toEqual([]);
    });
  });

  describe('assertCanAccessProject', () => {
    it('OWNER can access any project in workspace', async () => {
      const { prisma } = makeMockPrisma();
      const svc = new ProjectAccessService(prisma);
      await expect(svc.assertCanAccessProject(ctxAs(Role.OWNER), 'p-1')).resolves.toBeUndefined();
      await expect(svc.assertCanAccessProject(ctxAs(Role.OWNER), 'p-2')).resolves.toBeUndefined();
    });

    it('MEMBER can access any project in workspace', async () => {
      const { prisma } = makeMockPrisma();
      const svc = new ProjectAccessService(prisma);
      await expect(svc.assertCanAccessProject(ctxAs(Role.MEMBER), 'p-2')).resolves.toBeUndefined();
    });

    it('404 for anyone if project belongs to a different workspace', async () => {
      const { prisma } = makeMockPrisma();
      const svc = new ProjectAccessService(prisma);
      await expect(svc.assertCanAccessProject(ctxAs(Role.OWNER), 'p-3')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404 if project id does not exist at all', async () => {
      const { prisma } = makeMockPrisma();
      const svc = new ProjectAccessService(prisma);
      await expect(
        svc.assertCanAccessProject(ctxAs(Role.OWNER), 'nonexistent'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('COLLABORATOR can access their project', async () => {
      const { prisma } = makeMockPrisma();
      const svc = new ProjectAccessService(prisma);
      await expect(
        svc.assertCanAccessProject(ctxAs(Role.COLLABORATOR, 'user-collab'), 'p-1'),
      ).resolves.toBeUndefined();
    });

    it('COLLABORATOR gets 404 for a project in the workspace they are not a member of', async () => {
      const { prisma } = makeMockPrisma();
      const svc = new ProjectAccessService(prisma);
      await expect(
        svc.assertCanAccessProject(ctxAs(Role.COLLABORATOR, 'user-collab'), 'p-2'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('assertCanAccessTask', () => {
    it('MEMBER sees a task with matching workspace', async () => {
      const { prisma } = makeMockPrisma();
      const svc = new ProjectAccessService(prisma);
      await expect(
        svc.assertCanAccessTask(ctxAs(Role.MEMBER), { workspaceId: 'ws-1', projectId: 'p-1' }),
      ).resolves.toBeUndefined();
    });

    it('MEMBER sees an orphan task in their workspace', async () => {
      const { prisma } = makeMockPrisma();
      const svc = new ProjectAccessService(prisma);
      await expect(
        svc.assertCanAccessTask(ctxAs(Role.MEMBER), { workspaceId: 'ws-1', projectId: null }),
      ).resolves.toBeUndefined();
    });

    it('anyone gets 404 for a task in another workspace', async () => {
      const { prisma } = makeMockPrisma();
      const svc = new ProjectAccessService(prisma);
      await expect(
        svc.assertCanAccessTask(ctxAs(Role.OWNER), { workspaceId: 'ws-2', projectId: 'p-3' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('COLLABORATOR sees a task in their project', async () => {
      const { prisma } = makeMockPrisma();
      const svc = new ProjectAccessService(prisma);
      await expect(
        svc.assertCanAccessTask(ctxAs(Role.COLLABORATOR, 'user-collab'), {
          workspaceId: 'ws-1',
          projectId: 'p-1',
        }),
      ).resolves.toBeUndefined();
    });

    it('COLLABORATOR gets 404 for orphan tasks (no projectId)', async () => {
      const { prisma } = makeMockPrisma();
      const svc = new ProjectAccessService(prisma);
      await expect(
        svc.assertCanAccessTask(ctxAs(Role.COLLABORATOR, 'user-collab'), {
          workspaceId: 'ws-1',
          projectId: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('COLLABORATOR gets 404 for tasks in projects they are not a member of', async () => {
      const { prisma } = makeMockPrisma();
      const svc = new ProjectAccessService(prisma);
      await expect(
        svc.assertCanAccessTask(ctxAs(Role.COLLABORATOR, 'user-collab'), {
          workspaceId: 'ws-1',
          projectId: 'p-2',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
