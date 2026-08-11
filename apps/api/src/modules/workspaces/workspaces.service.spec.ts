/* eslint-disable @typescript-eslint/require-await -- mock implementations
   satisfy async signatures without actually awaiting; that's the point. */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { WorkspaceContext } from './guards/workspace-member.guard';
import { WorkspacesService } from './workspaces.service';

interface WorkspaceRow {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MembershipRow {
  userId: string;
  workspaceId: string;
  role: Role;
  joinedAt: Date;
}

interface MockPrisma {
  workspaceMember: {
    findMany: (args: {
      where: { userId: string };
      orderBy?: unknown;
      select?: unknown;
    }) => Promise<Array<{ role: Role; workspace: WorkspaceRow }>>;
  };
  workspace: {
    findUnique: (args: { where: { id: string }; select?: unknown }) => Promise<WorkspaceRow | null>;
    update: (args: {
      where: { id: string };
      data: { name: string };
      select?: unknown;
    }) => Promise<WorkspaceRow>;
  };
  __workspaces: WorkspaceRow[];
  __memberships: MembershipRow[];
}

function makeMockPrisma(): MockPrisma {
  const workspaces: WorkspaceRow[] = [
    {
      id: 'ws-1',
      slug: 'alice',
      name: "Alice's Workspace",
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    },
    {
      id: 'ws-2',
      slug: 'bob',
      name: "Bob's Workspace",
      createdAt: new Date('2026-01-02T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    },
  ];
  const memberships: MembershipRow[] = [
    { userId: 'alice-id', workspaceId: 'ws-1', role: Role.OWNER, joinedAt: new Date() },
    { userId: 'bob-id', workspaceId: 'ws-2', role: Role.OWNER, joinedAt: new Date() },
    { userId: 'bob-id', workspaceId: 'ws-1', role: Role.MEMBER, joinedAt: new Date() },
  ];

  return {
    workspaceMember: {
      findMany: async ({ where }) => {
        return memberships
          .filter((m) => m.userId === where.userId)
          .map((m) => ({
            role: m.role,
            workspace: workspaces.find((w) => w.id === m.workspaceId)!,
          }));
      },
    },
    workspace: {
      findUnique: async ({ where }) => workspaces.find((w) => w.id === where.id) ?? null,
      update: async ({ where, data }) => {
        const ws = workspaces.find((w) => w.id === where.id);
        if (!ws) throw new Error('not found');
        ws.name = data.name;
        ws.updatedAt = new Date();
        return ws;
      },
    },
    __workspaces: workspaces,
    __memberships: memberships,
  };
}

describe('WorkspacesService', () => {
  let service: WorkspacesService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makeMockPrisma();
    service = new WorkspacesService(prisma as unknown as PrismaService);
  });

  describe('listForUser', () => {
    it('returns only workspaces where the user is a member', async () => {
      const alice = await service.listForUser('alice-id');
      expect(alice).toHaveLength(1);
      expect(alice[0].slug).toBe('alice');
      expect(alice[0].role).toBe(Role.OWNER);
    });

    it('returns memberships from multiple workspaces', async () => {
      const bob = await service.listForUser('bob-id');
      expect(bob).toHaveLength(2);
      const slugs = bob.map((w) => w.slug).sort();
      expect(slugs).toEqual(['alice', 'bob']);
    });

    it('returns empty array for a user with no memberships', async () => {
      const eve = await service.listForUser('eve-id');
      expect(eve).toEqual([]);
    });

    it('serialises timestamps as ISO strings', async () => {
      const [ws] = await service.listForUser('alice-id');
      expect(ws.createdAt).toBe('2026-01-01T00:00:00.000Z');
      expect(ws.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  describe('getBySlug', () => {
    const aliceCtx: WorkspaceContext = {
      id: 'ws-1',
      slug: 'alice',
      name: "Alice's Workspace",
      role: Role.OWNER,
      userId: 'alice-id',
    };

    it('returns workspace detail with role from the context', async () => {
      const ws = await service.getBySlug(aliceCtx);
      expect(ws.id).toBe('ws-1');
      expect(ws.slug).toBe('alice');
      expect(ws.role).toBe(Role.OWNER);
    });

    it('throws NotFound if the row was deleted between guard and service', async () => {
      const ghostCtx: WorkspaceContext = { ...aliceCtx, id: 'ghost-id' };
      await expect(service.getBySlug(ghostCtx)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('rename', () => {
    const ownerCtx: WorkspaceContext = {
      id: 'ws-1',
      slug: 'alice',
      name: "Alice's Workspace",
      role: Role.OWNER,
      userId: 'alice-id',
    };
    const memberCtx: WorkspaceContext = {
      id: 'ws-1',
      slug: 'alice',
      name: "Alice's Workspace",
      role: Role.MEMBER,
      userId: 'bob-id',
    };

    it('lets an OWNER rename', async () => {
      const updated = await service.rename(ownerCtx, 'Alice Ltd.');
      expect(updated.name).toBe('Alice Ltd.');
      expect(prisma.__workspaces[0].name).toBe('Alice Ltd.');
    });

    it('rejects a MEMBER trying to rename', async () => {
      await expect(service.rename(memberCtx, 'Sneaky')).rejects.toBeInstanceOf(ForbiddenException);
      // Underlying row untouched.
      expect(prisma.__workspaces[0].name).toBe("Alice's Workspace");
    });

    it('rejects an ADMIN trying to rename (only OWNER is allowed for now)', async () => {
      const adminCtx: WorkspaceContext = { ...ownerCtx, role: Role.ADMIN };
      await expect(service.rename(adminCtx, 'Anything')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
