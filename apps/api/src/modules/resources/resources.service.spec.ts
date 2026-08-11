/* eslint-disable @typescript-eslint/require-await --
   mock implementations satisfy async signatures without actually awaiting; that's the
   point. Prisma-shaped methods take polymorphic `any` args by design. */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActivityType, ResourceType, Role } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';
import type { CloudinaryService, CloudinarySignedUpload } from './cloudinary.service';
import { ResourcesService } from './resources.service';

interface ResourceRow {
  id: string;
  taskId: string;
  type: ResourceType;
  url: string | null;
  cloudinaryKey: string | null;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedById: string;
  createdAt: Date;
}
interface TaskRow {
  id: string;
  workspaceId: string;
}
interface ActivityRow {
  id: string;
  taskId: string;
  actorId: string;
  type: ActivityType;
  payload: Record<string, unknown>;
}

const UPLOADER_LOOKUP: Record<
  string,
  { id: string; username: string; fullName: string; avatarUrl: string | null }
> = {
  'u-alice': { id: 'u-alice', username: 'alice', fullName: 'Alice', avatarUrl: null },
  'u-bob': { id: 'u-bob', username: 'bob', fullName: 'Bob', avatarUrl: null },
};

interface MockPrisma {
  resource: any;
  task: any;
  activity: any;
  $transaction: any;
  __resources: ResourceRow[];
  __activities: ActivityRow[];
  __seed: (r: ResourceRow) => number;
  __seedTask: (t: TaskRow) => number;
}

function makeMockPrisma(): MockPrisma {
  const resources: ResourceRow[] = [];
  const tasks: TaskRow[] = [];
  const activities: ActivityRow[] = [];
  let resourceCounter = 1;
  let activityCounter = 1;

  const buildWithUploader = (r: ResourceRow) => ({
    ...r,
    uploadedBy: UPLOADER_LOOKUP[r.uploadedById] ?? {
      id: r.uploadedById,
      username: '?',
      fullName: '?',
      avatarUrl: null,
    },
  });

  const prisma: MockPrisma = {
    resource: {
      findMany: async ({ where }: any) =>
        resources
          .filter((r) => r.taskId === where.taskId)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map(buildWithUploader),
      findUnique: async ({ where }: any) => resources.find((r) => r.id === where.id) ?? null,
      create: async ({ data }: any) => {
        const row: ResourceRow = {
          id: `r-${resourceCounter++}`,
          taskId: data.taskId,
          type: data.type,
          url: data.url ?? null,
          cloudinaryKey: data.cloudinaryKey ?? null,
          name: data.name,
          mimeType: data.mimeType ?? null,
          sizeBytes: data.sizeBytes ?? null,
          uploadedById: data.uploadedById,
          createdAt: new Date(),
        };
        resources.push(row);
        return buildWithUploader(row);
      },
      delete: async ({ where }: any) => {
        const idx = resources.findIndex((r) => r.id === where.id);
        if (idx === -1) throw new Error('not found');
        return resources.splice(idx, 1)[0];
      },
    },
    task: {
      findFirst: async ({ where }: any) =>
        tasks.find(
          (t) =>
            (where.id === undefined || t.id === where.id) &&
            (where.workspaceId === undefined || t.workspaceId === where.workspaceId),
        ) ?? null,
    },
    activity: {
      create: async ({ data }: any) => {
        const row: ActivityRow = {
          id: `a-${activityCounter++}`,
          taskId: data.taskId,
          actorId: data.actorId,
          type: data.type,
          payload: data.payload,
        };
        activities.push(row);
        return row;
      },
    },
    $transaction: async (cb: any) => cb(prisma),
    __resources: resources,
    __activities: activities,
    __seed: (r) => resources.push(r),
    __seedTask: (t) => tasks.push(t),
  };
  return prisma;
}

// Stub Cloudinary — returns predictable values, no network calls.
const cloudinaryStub: Pick<CloudinaryService, 'signUpload' | 'signReadUrl'> = {
  signUpload: (taskId: string): CloudinarySignedUpload => ({
    cloudName: 'test-cloud',
    apiKey: 'test-key',
    timestamp: 1_000_000,
    signature: 'test-sig',
    folder: `task_mgmt_uploads/tasks/${taskId}`,
    uploadUrl: 'https://api.cloudinary.com/v1_1/test-cloud/auto/upload',
    resourceType: 'auto',
    type: 'authenticated',
  }),
  signReadUrl: (publicId: string) => `https://cloudinary.test/signed/${publicId}?ex=1234`,
};

const ws1: WorkspaceContext = { id: 'ws-1', slug: 'w', name: 'W', role: Role.OWNER };
const memberCtx: WorkspaceContext = { ...ws1, role: Role.MEMBER };

function makeResource(overrides: Partial<ResourceRow>): ResourceRow {
  return {
    id: overrides.id ?? 'r-seed',
    taskId: overrides.taskId ?? 't-1',
    type: overrides.type ?? ResourceType.LINK,
    url: overrides.url ?? 'https://example.com',
    cloudinaryKey: overrides.cloudinaryKey ?? null,
    name: overrides.name ?? 'seed',
    mimeType: overrides.mimeType ?? null,
    sizeBytes: overrides.sizeBytes ?? null,
    uploadedById: overrides.uploadedById ?? 'u-alice',
    createdAt: overrides.createdAt ?? new Date(),
  };
}

describe('ResourcesService', () => {
  let service: ResourcesService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = makeMockPrisma();
    service = new ResourcesService(
      prisma as unknown as PrismaService,
      new ActivityService(prisma as unknown as PrismaService),
      cloudinaryStub as unknown as CloudinaryService,
    );
    prisma.__seedTask({ id: 't-1', workspaceId: 'ws-1' });
    prisma.__seedTask({ id: 't-other', workspaceId: 'ws-other' });
  });

  // ---------------------------------------------------------------------------
  // list
  // ---------------------------------------------------------------------------
  describe('list', () => {
    it('returns resources for the task', async () => {
      prisma.__seed(makeResource({ id: 'r-a' }));
      prisma.__seed(makeResource({ id: 'r-b' }));
      const list = await service.list(ws1, 't-1');
      expect(list.map((r) => r.id).sort()).toEqual(['r-a', 'r-b']);
    });

    it('cross-workspace → 404', async () => {
      await expect(service.list(ws1, 't-other')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // create (LINK)
  // ---------------------------------------------------------------------------
  describe('create LINK', () => {
    it('creates a LINK and writes RESOURCE_ADDED activity', async () => {
      const r = await service.create(ws1, 'u-alice', 't-1', {
        type: ResourceType.LINK,
        name: 'Design',
        url: 'https://example.com/design',
      });
      expect(r.type).toBe(ResourceType.LINK);
      expect(r.url).toBe('https://example.com/design');
      expect(r.cloudinaryKey).toBeNull();
      expect(prisma.__activities.filter((a) => a.type === 'RESOURCE_ADDED')).toHaveLength(1);
    });

    it('LINK without url → 400', async () => {
      await expect(
        service.create(ws1, 'u-alice', 't-1', { type: ResourceType.LINK, name: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------------
  // create (FILE)
  // ---------------------------------------------------------------------------
  describe('create FILE', () => {
    it('creates a FILE with cloudinaryKey (LINK-only fields nulled)', async () => {
      const r = await service.create(ws1, 'u-alice', 't-1', {
        type: ResourceType.FILE,
        name: 'screenshot.png',
        cloudinaryKey: 'task_mgmt/tasks/t-1/abc123',
        mimeType: 'image/png',
        sizeBytes: 12345,
      });
      expect(r.type).toBe(ResourceType.FILE);
      expect(r.cloudinaryKey).toBe('task_mgmt/tasks/t-1/abc123');
      expect(r.url).toBeNull();
      expect(r.mimeType).toBe('image/png');
      expect(r.sizeBytes).toBe(12345);
    });

    it('FILE without cloudinaryKey → 400', async () => {
      await expect(
        service.create(ws1, 'u-alice', 't-1', { type: ResourceType.FILE, name: 'x' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ---------------------------------------------------------------------------
  // signUpload
  // ---------------------------------------------------------------------------
  describe('signUpload', () => {
    it('returns cloudinary sign params (folder scoped by taskId)', async () => {
      const params = await service.signUpload(ws1, 't-1');
      expect(params.folder).toBe('task_mgmt_uploads/tasks/t-1');
      expect(params.signature).toBe('test-sig');
    });

    it('cross-workspace task → 404 (does not sign anything)', async () => {
      await expect(service.signUpload(ws1, 't-other')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // getSignedReadUrl
  // ---------------------------------------------------------------------------
  describe('getSignedReadUrl', () => {
    it('returns a signed URL for a FILE resource', async () => {
      prisma.__seed(
        makeResource({
          id: 'r-file',
          type: ResourceType.FILE,
          url: null,
          cloudinaryKey: 'abc/xyz',
        }),
      );
      const res = await service.getSignedReadUrl(ws1, 't-1', 'r-file');
      expect(res.url).toContain('abc/xyz');
      expect(res.expiresInSeconds).toBe(300);
    });

    it('rejects a LINK resource (400)', async () => {
      prisma.__seed(makeResource({ id: 'r-link', type: ResourceType.LINK }));
      await expect(service.getSignedReadUrl(ws1, 't-1', 'r-link')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('cross-task → 404', async () => {
      prisma.__seed(
        makeResource({ id: 'r-elsewhere', taskId: 't-other', type: ResourceType.FILE }),
      );
      await expect(service.getSignedReadUrl(ws1, 't-1', 'r-elsewhere')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // delete
  // ---------------------------------------------------------------------------
  describe('delete', () => {
    it('uploader can delete own', async () => {
      prisma.__seed(makeResource({ id: 'r-1', uploadedById: 'u-alice' }));
      await service.delete(ws1, 'u-alice', 't-1', 'r-1');
      expect(prisma.__resources).toHaveLength(0);
    });

    it('OWNER can moderate (delete other users uploads)', async () => {
      prisma.__seed(makeResource({ id: 'r-1', uploadedById: 'u-bob' }));
      await service.delete(ws1, 'u-alice', 't-1', 'r-1');
      expect(prisma.__resources).toHaveLength(0);
    });

    it('non-uploader non-moderator MEMBER cannot delete', async () => {
      prisma.__seed(makeResource({ id: 'r-1', uploadedById: 'u-alice' }));
      await expect(service.delete(memberCtx, 'u-bob', 't-1', 'r-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('cross-task → 404', async () => {
      prisma.__seed(makeResource({ id: 'r-x', taskId: 't-other' }));
      await expect(service.delete(ws1, 'u-alice', 't-1', 'r-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
