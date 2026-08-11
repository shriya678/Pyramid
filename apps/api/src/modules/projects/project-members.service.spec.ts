/* eslint-disable @typescript-eslint/require-await -- mock implementations
   satisfy async signatures without actually awaiting; that's the point.
   Prisma-shaped methods take polymorphic `any` args by design. */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';
import { ProjectMembersService } from './project-members.service';

interface UserRow {
  id: string;
  email: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  isGuest: boolean;
  isSeeded: boolean;
}
interface WorkspaceMemberRow {
  workspaceId: string;
  userId: string;
  role: Role;
  joinedAt: Date;
}
interface ProjectRow {
  id: string;
  workspaceId: string;
}
interface ProjectMemberRow {
  projectId: string;
  userId: string;
  addedById: string;
  addedAt: Date;
}

function u(id: string, email: string, extras: Partial<UserRow> = {}): UserRow {
  return {
    id,
    email,
    username: id,
    fullName: id[0].toUpperCase() + id.slice(1),
    avatarUrl: null,
    isGuest: false,
    isSeeded: false,
    ...extras,
  };
}

function makeMockPrisma() {
  const users: UserRow[] = [
    u('alice', 'alice@example.com'),
    u('bob', 'bob@example.com'),
    u('carol', 'carol@example.com'),
    u('dave', 'dave@example.com'),
  ];
  const projects: ProjectRow[] = [
    { id: 'p-1', workspaceId: 'ws-1' },
    { id: 'p-2', workspaceId: 'ws-1' },
    { id: 'p-other', workspaceId: 'ws-other' },
  ];
  const memberships: WorkspaceMemberRow[] = [
    { workspaceId: 'ws-1', userId: 'alice', role: Role.OWNER, joinedAt: new Date() },
    { workspaceId: 'ws-1', userId: 'bob', role: Role.MEMBER, joinedAt: new Date() },
  ];
  const projectMembers: ProjectMemberRow[] = [];

  const prisma = {
    user: {
      findUnique: async ({
        where,
      }: {
        where: { email?: string; id?: string };
        select?: unknown;
      }) => {
        if (where.email) return users.find((x) => x.email === where.email) ?? null;
        if (where.id) return users.find((x) => x.id === where.id) ?? null;
        return null;
      },
    },
    project: {
      findUnique: async ({ where }: { where: { id: string }; select?: unknown }) => {
        const p = projects.find((x) => x.id === where.id);
        return p ? { workspaceId: p.workspaceId } : null;
      },
    },
    workspaceMember: {
      findMany: async ({
        where,
      }: {
        where: { workspaceId: string; role?: { in: Role[] } };
        select?: unknown;
      }) => {
        return memberships
          .filter(
            (m) =>
              m.workspaceId === where.workspaceId &&
              (where.role ? where.role.in.includes(m.role) : true),
          )
          .map((m) => ({
            userId: m.userId,
            role: m.role,
            joinedAt: m.joinedAt,
            user: users.find((x) => x.id === m.userId)!,
          }));
      },
      findUnique: async ({
        where,
      }: {
        where: { workspaceId_userId: { workspaceId: string; userId: string } };
      }) => {
        const row = memberships.find(
          (m) =>
            m.workspaceId === where.workspaceId_userId.workspaceId &&
            m.userId === where.workspaceId_userId.userId,
        );
        return row ? { role: row.role } : null;
      },
      create: async ({ data }: { data: { workspaceId: string; userId: string; role: Role } }) => {
        const row = {
          workspaceId: data.workspaceId,
          userId: data.userId,
          role: data.role,
          joinedAt: new Date(),
        };
        memberships.push(row);
        return row;
      },
    },
    projectMember: {
      findMany: async ({ where }: { where: { projectId: string }; select?: unknown }) => {
        return projectMembers
          .filter((pm) => pm.projectId === where.projectId)
          .map((pm) => ({
            ...pm,
            user: users.find((x) => x.id === pm.userId)!,
          }));
      },
      findUnique: async ({
        where,
      }: {
        where: { projectId_userId: { projectId: string; userId: string } };
        select?: unknown;
      }) => {
        const row = projectMembers.find(
          (pm) =>
            pm.projectId === where.projectId_userId.projectId &&
            pm.userId === where.projectId_userId.userId,
        );
        return row ? { projectId: row.projectId } : null;
      },
      create: async ({
        data,
      }: {
        data: { projectId: string; userId: string; addedById: string };
      }) => {
        const row: ProjectMemberRow = {
          projectId: data.projectId,
          userId: data.userId,
          addedById: data.addedById,
          addedAt: new Date(),
        };
        projectMembers.push(row);
        return {
          projectId: row.projectId,
          userId: row.userId,
          addedById: row.addedById,
          addedAt: row.addedAt,
          user: users.find((x) => x.id === row.userId)!,
        };
      },
      delete: async ({
        where,
      }: {
        where: { projectId_userId: { projectId: string; userId: string } };
      }) => {
        const idx = projectMembers.findIndex(
          (pm) =>
            pm.projectId === where.projectId_userId.projectId &&
            pm.userId === where.projectId_userId.userId,
        );
        if (idx === -1) throw new Error('not found');
        return projectMembers.splice(idx, 1)[0];
      },
    },
    $transaction: async <T>(cb: (tx: unknown) => Promise<T>) => cb(prisma),
    __users: users,
    __memberships: memberships,
    __projectMembers: projectMembers,
  };
  return prisma;
}

type MockPrisma = ReturnType<typeof makeMockPrisma>;

const ownerCtx: WorkspaceContext = {
  id: 'ws-1',
  slug: 'ws-1',
  name: 'W',
  role: Role.OWNER,
  userId: 'alice',
};
const memberCtx: WorkspaceContext = { ...ownerCtx, userId: 'bob', role: Role.MEMBER };
const collabCtx: WorkspaceContext = { ...ownerCtx, userId: 'carol', role: Role.COLLABORATOR };

describe('ProjectMembersService', () => {
  let service: ProjectMembersService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makeMockPrisma();
    service = new ProjectMembersService(prisma as unknown as PrismaService);
  });

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------
  describe('list', () => {
    it('returns workspace OWNER/ADMIN/MEMBER plus explicit COLLABORATORs', async () => {
      // alice OWNER, bob MEMBER (from mock seed). Add carol as COLLABORATOR
      // of workspace + ProjectMember of p-1.
      prisma.__memberships.push({
        workspaceId: 'ws-1',
        userId: 'carol',
        role: Role.COLLABORATOR,
        joinedAt: new Date(),
      });
      prisma.__projectMembers.push({
        projectId: 'p-1',
        userId: 'carol',
        addedById: 'alice',
        addedAt: new Date(),
      });

      const list = await service.list(ownerCtx, 'p-1');
      const byId = Object.fromEntries(list.map((m) => [m.userId, m]));
      expect(Object.keys(byId).sort()).toEqual(['alice', 'bob', 'carol']);
      expect(byId.alice.workspaceRole).toBe(Role.OWNER);
      expect(byId.bob.workspaceRole).toBe(Role.MEMBER);
      expect(byId.carol.workspaceRole).toBe(Role.COLLABORATOR);
      expect(byId.carol.addedById).toBe('alice');
    });

    it('excludes a COLLABORATOR who is not in ProjectMember for THIS project', async () => {
      // carol is a COLLABORATOR of ws-1 but only for p-2.
      prisma.__memberships.push({
        workspaceId: 'ws-1',
        userId: 'carol',
        role: Role.COLLABORATOR,
        joinedAt: new Date(),
      });
      prisma.__projectMembers.push({
        projectId: 'p-2',
        userId: 'carol',
        addedById: 'alice',
        addedAt: new Date(),
      });
      const list = await service.list(ownerCtx, 'p-1');
      expect(list.some((m) => m.userId === 'carol')).toBe(false);
    });

    it('cross-workspace project → 404', async () => {
      await expect(service.list(ownerCtx, 'p-other')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('non-existent project → 404', async () => {
      await expect(service.list(ownerCtx, 'p-nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // add
  // ---------------------------------------------------------------------------
  describe('add', () => {
    it('OWNER can invite a stranger — creates COLLABORATOR + ProjectMember atomically', async () => {
      const r = await service.add(ownerCtx, 'p-1', { email: 'carol@example.com' });
      expect(r.alreadyHasAccess).toBe(false);
      if (!r.alreadyHasAccess) {
        expect(r.implicitWorkspaceAdd).toBe(true);
        expect(r.member.workspaceRole).toBe(Role.COLLABORATOR);
        expect(r.member.addedById).toBe('alice');
      }
      expect(prisma.__memberships.some((m) => m.userId === 'carol')).toBe(true);
      expect(prisma.__projectMembers.some((pm) => pm.userId === 'carol')).toBe(true);
    });

    it('existing MEMBER → { alreadyHasAccess: true }, no ProjectMember row inserted', async () => {
      // bob is already MEMBER of ws-1
      const r = await service.add(ownerCtx, 'p-1', { email: 'bob@example.com' });
      expect(r.alreadyHasAccess).toBe(true);
      if (r.alreadyHasAccess) {
        expect(r.workspaceRole).toBe(Role.MEMBER);
      }
      expect(prisma.__projectMembers.length).toBe(0);
    });

    it('existing OWNER → { alreadyHasAccess: true }', async () => {
      // alice is OWNER
      const r = await service.add(ownerCtx, 'p-1', { email: 'alice@example.com' });
      expect(r.alreadyHasAccess).toBe(true);
      if (r.alreadyHasAccess) {
        expect(r.workspaceRole).toBe(Role.OWNER);
      }
    });

    it('existing COLLABORATOR on THIS project → 409', async () => {
      prisma.__memberships.push({
        workspaceId: 'ws-1',
        userId: 'carol',
        role: Role.COLLABORATOR,
        joinedAt: new Date(),
      });
      prisma.__projectMembers.push({
        projectId: 'p-1',
        userId: 'carol',
        addedById: 'alice',
        addedAt: new Date(),
      });
      await expect(
        service.add(ownerCtx, 'p-1', { email: 'carol@example.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('existing COLLABORATOR on a DIFFERENT project → adds them to this one without re-adding to workspace', async () => {
      prisma.__memberships.push({
        workspaceId: 'ws-1',
        userId: 'carol',
        role: Role.COLLABORATOR,
        joinedAt: new Date(),
      });
      prisma.__projectMembers.push({
        projectId: 'p-2',
        userId: 'carol',
        addedById: 'alice',
        addedAt: new Date(),
      });
      const r = await service.add(ownerCtx, 'p-1', { email: 'carol@example.com' });
      expect(r.alreadyHasAccess).toBe(false);
      if (!r.alreadyHasAccess) {
        expect(r.implicitWorkspaceAdd).toBe(false);
      }
      // ProjectMember rows for BOTH projects
      expect(
        prisma.__projectMembers
          .filter((pm) => pm.userId === 'carol')
          .map((pm) => pm.projectId)
          .sort(),
      ).toEqual(['p-1', 'p-2']);
      // Still exactly one WorkspaceMember row for carol
      expect(prisma.__memberships.filter((m) => m.userId === 'carol').length).toBe(1);
    });

    it('unknown email → 400', async () => {
      await expect(
        service.add(ownerCtx, 'p-1', { email: 'nobody@example.com' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('MEMBER cannot invite → 403', async () => {
      await expect(
        service.add(memberCtx, 'p-1', { email: 'carol@example.com' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('COLLABORATOR cannot invite → 403', async () => {
      await expect(
        service.add(collabCtx, 'p-1', { email: 'carol@example.com' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('cross-workspace project → 404', async () => {
      await expect(
        service.add(ownerCtx, 'p-other', { email: 'carol@example.com' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // remove
  // ---------------------------------------------------------------------------
  describe('remove', () => {
    it('OWNER can remove a COLLABORATOR from a project', async () => {
      prisma.__memberships.push({
        workspaceId: 'ws-1',
        userId: 'carol',
        role: Role.COLLABORATOR,
        joinedAt: new Date(),
      });
      prisma.__projectMembers.push({
        projectId: 'p-1',
        userId: 'carol',
        addedById: 'alice',
        addedAt: new Date(),
      });
      await service.remove(ownerCtx, 'p-1', 'carol');
      expect(prisma.__projectMembers.length).toBe(0);
      // WorkspaceMember row is preserved — that's the workspace-remove flow's job.
      expect(prisma.__memberships.some((m) => m.userId === 'carol')).toBe(true);
    });

    it('remove self → 400', async () => {
      await expect(service.remove(ownerCtx, 'p-1', 'alice')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('user has no ProjectMember row → 404', async () => {
      await expect(service.remove(ownerCtx, 'p-1', 'bob')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('cross-workspace project → 404', async () => {
      await expect(service.remove(ownerCtx, 'p-other', 'bob')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('MEMBER cannot remove → 403', async () => {
      prisma.__memberships.push({
        workspaceId: 'ws-1',
        userId: 'carol',
        role: Role.COLLABORATOR,
        joinedAt: new Date(),
      });
      prisma.__projectMembers.push({
        projectId: 'p-1',
        userId: 'carol',
        addedById: 'alice',
        addedAt: new Date(),
      });
      await expect(service.remove(memberCtx, 'p-1', 'carol')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
