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
import type { WorkspaceContext } from './guards/workspace-member.guard';
import { WorkspaceMembersService } from './workspace-members.service';

interface UserRow {
  id: string;
  email: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
  isGuest: boolean;
  isSeeded: boolean;
}
interface MembershipRow {
  workspaceId: string;
  userId: string;
  role: Role;
  joinedAt: Date;
}
interface ProjectMemberRow {
  projectId: string;
  userId: string;
}
interface ProjectRow {
  id: string;
  workspaceId: string;
}

function makeMockPrisma() {
  const users: UserRow[] = [
    {
      id: 'alice',
      email: 'alice@example.com',
      username: 'alice',
      fullName: 'Alice',
      avatarUrl: null,
      isGuest: false,
      isSeeded: false,
    },
    {
      id: 'bob',
      email: 'bob@example.com',
      username: 'bob',
      fullName: 'Bob',
      avatarUrl: null,
      isGuest: false,
      isSeeded: false,
    },
    {
      id: 'carol',
      email: 'carol@example.com',
      username: 'carol',
      fullName: 'Carol',
      avatarUrl: null,
      isGuest: false,
      isSeeded: false,
    },
  ];
  const memberships: MembershipRow[] = [
    { workspaceId: 'ws-1', userId: 'alice', role: Role.OWNER, joinedAt: new Date() },
  ];
  const projects: ProjectRow[] = [
    { id: 'p-1', workspaceId: 'ws-1' },
    { id: 'p-2', workspaceId: 'ws-1' },
  ];
  const projectMembers: ProjectMemberRow[] = [];

  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) return users.find((u) => u.email === where.email) ?? null;
        if (where.id) return users.find((u) => u.id === where.id) ?? null;
        return null;
      },
    },
    workspaceMember: {
      findMany: async ({ where }: { where: { workspaceId: string } }) => {
        const rows = memberships.filter((m) => m.workspaceId === where.workspaceId);
        return rows.map((m) => ({
          workspaceId: m.workspaceId,
          userId: m.userId,
          role: m.role,
          joinedAt: m.joinedAt,
          user: users.find((u) => u.id === m.userId)!,
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
        const row: MembershipRow = {
          workspaceId: data.workspaceId,
          userId: data.userId,
          role: data.role,
          joinedAt: new Date(),
        };
        memberships.push(row);
        return {
          workspaceId: row.workspaceId,
          userId: row.userId,
          role: row.role,
          joinedAt: row.joinedAt,
          user: users.find((u) => u.id === row.userId)!,
        };
      },
      count: async ({ where }: { where: { workspaceId: string; role?: Role } }) => {
        return memberships.filter(
          (m) => m.workspaceId === where.workspaceId && (where.role ? m.role === where.role : true),
        ).length;
      },
      delete: async ({
        where,
      }: {
        where: { workspaceId_userId: { workspaceId: string; userId: string } };
      }) => {
        const idx = memberships.findIndex(
          (m) =>
            m.workspaceId === where.workspaceId_userId.workspaceId &&
            m.userId === where.workspaceId_userId.userId,
        );
        if (idx === -1) throw new Error('not found');
        return memberships.splice(idx, 1)[0];
      },
    },
    projectMember: {
      deleteMany: async ({
        where,
      }: {
        where: { userId: string; project: { workspaceId: string } };
      }) => {
        const workspaceProjectIds = new Set(
          projects.filter((p) => p.workspaceId === where.project.workspaceId).map((p) => p.id),
        );
        const before = projectMembers.length;
        for (let i = projectMembers.length - 1; i >= 0; i--) {
          const pm = projectMembers[i];
          if (pm.userId === where.userId && workspaceProjectIds.has(pm.projectId)) {
            projectMembers.splice(i, 1);
          }
        }
        return { count: before - projectMembers.length };
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
const adminCtx: WorkspaceContext = { ...ownerCtx, userId: 'bob-admin', role: Role.ADMIN };
const memberCtx: WorkspaceContext = { ...ownerCtx, userId: 'bob-member', role: Role.MEMBER };
const collabCtx: WorkspaceContext = { ...ownerCtx, userId: 'bob-collab', role: Role.COLLABORATOR };

describe('WorkspaceMembersService', () => {
  let service: WorkspaceMembersService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makeMockPrisma();
    service = new WorkspaceMembersService(prisma as unknown as PrismaService);
  });

  describe('list', () => {
    it('any member can list the roster', async () => {
      const rows = await service.list(ownerCtx);
      expect(rows.map((r) => r.userId)).toEqual(['alice']);
    });
  });

  describe('add', () => {
    it('OWNER can add a user by email as MEMBER', async () => {
      const r = await service.add(ownerCtx, { email: 'bob@example.com', role: 'MEMBER' });
      expect(r.role).toBe(Role.MEMBER);
      expect(r.user.id).toBe('bob');
    });

    it('normalises email case + trimming (DTO transform → happy path here)', async () => {
      const r = await service.add(ownerCtx, { email: 'CAROL@example.com  ', role: 'ADMIN' });
      // The service itself lowercases before lookup, defence-in-depth beyond DTO.
      expect(r.user.id).toBe('carol');
      expect(r.role).toBe(Role.ADMIN);
    });

    it('ADMIN can invite too', async () => {
      // First insert an admin so we have a caller with the ADMIN role.
      prisma.__memberships.push({
        workspaceId: 'ws-1',
        userId: 'bob-admin',
        role: Role.ADMIN,
        joinedAt: new Date(),
      });
      const r = await service.add(adminCtx, { email: 'bob@example.com', role: 'MEMBER' });
      expect(r.role).toBe(Role.MEMBER);
    });

    it('MEMBER cannot invite → 403', async () => {
      await expect(
        service.add(memberCtx, { email: 'bob@example.com', role: 'MEMBER' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('COLLABORATOR cannot invite → 403', async () => {
      await expect(
        service.add(collabCtx, { email: 'bob@example.com', role: 'MEMBER' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('unknown email → 400', async () => {
      await expect(
        service.add(ownerCtx, { email: 'nobody@example.com', role: 'MEMBER' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('already-a-member → 409', async () => {
      // alice is already OWNER of ws-1
      await expect(
        service.add(ownerCtx, { email: 'alice@example.com', role: 'MEMBER' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('self-invite (owner adding self) → 409 duplicate', async () => {
      await expect(
        service.add(ownerCtx, { email: 'alice@example.com', role: 'MEMBER' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it('OWNER can remove a MEMBER', async () => {
      prisma.__memberships.push({
        workspaceId: 'ws-1',
        userId: 'bob',
        role: Role.MEMBER,
        joinedAt: new Date(),
      });
      await service.remove(ownerCtx, 'bob');
      expect(prisma.__memberships.some((m) => m.userId === 'bob')).toBe(false);
    });

    it('cascade-deletes their ProjectMember rows in this workspace', async () => {
      prisma.__memberships.push({
        workspaceId: 'ws-1',
        userId: 'bob',
        role: Role.COLLABORATOR,
        joinedAt: new Date(),
      });
      prisma.__projectMembers.push({ projectId: 'p-1', userId: 'bob' });
      prisma.__projectMembers.push({ projectId: 'p-2', userId: 'bob' });
      await service.remove(ownerCtx, 'bob');
      expect(prisma.__projectMembers.length).toBe(0);
    });

    it('self-remove → 400', async () => {
      await expect(service.remove(ownerCtx, ownerCtx.userId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('remove sole OWNER (a different owner) → 400', async () => {
      // Make an admin (so they can call) and try to remove alice (sole owner).
      prisma.__memberships.push({
        workspaceId: 'ws-1',
        userId: 'bob-admin',
        role: Role.ADMIN,
        joinedAt: new Date(),
      });
      await expect(service.remove(adminCtx, 'alice')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('MEMBER cannot remove → 403', async () => {
      prisma.__memberships.push({
        workspaceId: 'ws-1',
        userId: 'bob',
        role: Role.MEMBER,
        joinedAt: new Date(),
      });
      await expect(service.remove(memberCtx, 'bob')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('remove non-member → 404', async () => {
      await expect(service.remove(ownerCtx, 'ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
