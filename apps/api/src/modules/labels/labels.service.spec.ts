/* eslint-disable @typescript-eslint/require-await -- mock implementations
   satisfy async signatures without actually awaiting; that's the point. */
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';
import { LabelsService } from './labels.service';

interface LabelRow {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  createdAt: Date;
}

function makeMockPrisma() {
  const labels: LabelRow[] = [];
  const uniqueNameGuard = new Set<string>();

  const prisma = {
    label: {
      findMany: async ({
        where,
        orderBy,
      }: {
        where: { workspaceId: string };
        orderBy?: { name: 'asc' | 'desc' };
      }) => {
        const rows = labels.filter((l) => l.workspaceId === where.workspaceId);
        if (orderBy?.name === 'asc') rows.sort((a, b) => a.name.localeCompare(b.name));
        return rows;
      },
      findUnique: async ({ where }: { where: { id: string } }) =>
        labels.find((l) => l.id === where.id) ?? null,
      create: async ({ data }: { data: { workspaceId: string; name: string; color: string } }) => {
        const key = `${data.workspaceId}::${data.name}`;
        if (uniqueNameGuard.has(key)) {
          const err = new Error('unique');
          (err as Error & { code?: string }).code = 'P2002';
          throw err;
        }
        uniqueNameGuard.add(key);
        const row: LabelRow = { id: `lb-${labels.length + 1}`, createdAt: new Date(), ...data };
        labels.push(row);
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Omit<LabelRow, 'id' | 'createdAt'>>;
      }) => {
        const row = labels.find((l) => l.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const idx = labels.findIndex((l) => l.id === where.id);
        if (idx === -1) throw new Error('not found');
        return labels.splice(idx, 1)[0];
      },
    },
    __labels: labels,
  };
  return prisma;
}

const owner: WorkspaceContext = {
  id: 'ws-1',
  slug: 'w',
  name: 'W',
  role: Role.OWNER,
};
const member: WorkspaceContext = { ...owner, role: Role.MEMBER };

describe('LabelsService', () => {
  let service: LabelsService;
  let prisma: ReturnType<typeof makeMockPrisma>;

  beforeEach(() => {
    prisma = makeMockPrisma();
    service = new LabelsService(prisma as unknown as PrismaService);
  });

  it('list returns labels sorted by name', async () => {
    await service.create(owner, { name: 'Bug', color: '#ff0000' });
    await service.create(owner, { name: 'Api', color: '#00ff00' });
    const list = await service.list(owner);
    expect(list.map((l) => l.name)).toEqual(['Api', 'Bug']);
  });

  it('OWNER can create; MEMBER cannot', async () => {
    await expect(service.create(member, { name: 'X', color: '#000000' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.create(owner, { name: 'X', color: '#000000' })).resolves.toMatchObject({
      name: 'X',
    });
  });

  it('duplicate name in same workspace → Conflict', async () => {
    await service.create(owner, { name: 'Same', color: '#111111' });
    await expect(service.create(owner, { name: 'Same', color: '#222222' })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('update from another workspace → 404', async () => {
    prisma.__labels.push({
      id: 'x',
      workspaceId: 'ws-other',
      name: 'Other',
      color: '#000000',
      createdAt: new Date(),
    });
    await expect(service.update(owner, 'x', { name: 'Sneak' })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('MEMBER cannot delete', async () => {
    const created = await service.create(owner, { name: 'Del', color: '#000000' });
    await expect(service.delete(member, created.id)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('OWNER can delete', async () => {
    const created = await service.create(owner, { name: 'Del', color: '#000000' });
    await service.delete(owner, created.id);
    expect(prisma.__labels).toHaveLength(0);
  });
});
