import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityType, ResourceType, Role, type Resource, type User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';
import { CloudinaryService, type CloudinarySignedUpload } from './cloudinary.service';
import type { CreateResourceDto } from './dto/create-resource.dto';

export interface ResourceUploaderMini {
  id: string;
  username: string;
  fullName: string;
  avatarUrl: string | null;
}

export interface ResourceResponse {
  id: string;
  taskId: string;
  type: ResourceType;
  name: string;
  url: string | null;
  cloudinaryKey: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedBy: ResourceUploaderMini;
  createdAt: string;
}

type ResourceWithUploader = Resource & {
  uploadedBy: Pick<User, 'id' | 'username' | 'fullName' | 'avatarUrl'>;
};

const UPLOADER_SELECT = {
  id: true,
  username: true,
  fullName: true,
  avatarUrl: true,
} as const;

const toResponse = (r: ResourceWithUploader): ResourceResponse => ({
  id: r.id,
  taskId: r.taskId,
  type: r.type,
  name: r.name,
  url: r.url,
  cloudinaryKey: r.cloudinaryKey,
  mimeType: r.mimeType,
  sizeBytes: r.sizeBytes,
  uploadedBy: r.uploadedBy,
  createdAt: r.createdAt.toISOString(),
});

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async list(ctx: WorkspaceContext, taskId: string): Promise<ResourceResponse[]> {
    await this.requireTaskInWorkspace(ctx, taskId);
    const rows = await this.prisma.resource.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
      include: { uploadedBy: { select: UPLOADER_SELECT } },
    });
    return rows.map(toResponse);
  }

  /**
   * Cloudinary signed upload params for a task. The frontend takes these,
   * POSTs the file directly to Cloudinary, then calls `create()` with the
   * `cloudinaryKey` that Cloudinary returned.
   */
  async signUpload(ctx: WorkspaceContext, taskId: string): Promise<CloudinarySignedUpload> {
    await this.requireTaskInWorkspace(ctx, taskId);
    return this.cloudinary.signUpload(taskId);
  }

  async create(
    ctx: WorkspaceContext,
    actorId: string,
    taskId: string,
    dto: CreateResourceDto,
  ): Promise<ResourceResponse> {
    await this.requireTaskInWorkspace(ctx, taskId);

    // Coerce type-specific fields; ValidationPipe has already whitelisted them
    // but be explicit about which columns get written for each type.
    const isFile = dto.type === ResourceType.FILE;
    if (!isFile && !dto.url) {
      throw new BadRequestException('LINK resources require a url');
    }
    if (isFile && !dto.cloudinaryKey) {
      throw new BadRequestException('FILE resources require a cloudinaryKey');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const r = await tx.resource.create({
        data: {
          taskId,
          type: dto.type,
          name: dto.name,
          url: isFile ? null : (dto.url ?? null),
          cloudinaryKey: isFile ? (dto.cloudinaryKey ?? null) : null,
          mimeType: isFile ? (dto.mimeType ?? null) : null,
          sizeBytes: isFile ? (dto.sizeBytes ?? null) : null,
          uploadedById: actorId,
        },
        include: { uploadedBy: { select: UPLOADER_SELECT } },
      });
      await this.activity.append(tx, {
        taskId,
        actorId,
        type: ActivityType.RESOURCE_ADDED,
        payload: { resourceId: r.id, resourceType: r.type, name: r.name },
      });
      return r;
    });
    return toResponse(created);
  }

  /**
   * Signed read URL for a FILE resource. Regenerated on every request — the
   * frontend calls this each time it needs to render, so the URL is always
   * fresh and never long-lived. LINK resources don't need this (their `url`
   * is public).
   */
  async getSignedReadUrl(
    ctx: WorkspaceContext,
    taskId: string,
    resourceId: string,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    await this.requireTaskInWorkspace(ctx, taskId);
    const row = await this.loadResourceOnTask(taskId, resourceId);
    if (row.type !== ResourceType.FILE || !row.cloudinaryKey) {
      throw new BadRequestException('Signed URLs are only for FILE resources');
    }
    return {
      url: this.cloudinary.signReadUrl(row.cloudinaryKey),
      expiresInSeconds: 5 * 60,
    };
  }

  /**
   * Delete. Uploader OR workspace OWNER/ADMIN.
   *
   * We deliberately do NOT delete the underlying Cloudinary asset here —
   * that would be a network call inside a DB transaction, brittle and slow.
   * A nightly reconcile cron would be the right cleanup path. For a demo,
   * orphaned Cloudinary rows are acceptable (documented in README).
   */
  async delete(
    ctx: WorkspaceContext,
    actorId: string,
    taskId: string,
    resourceId: string,
  ): Promise<{ ok: true }> {
    await this.requireTaskInWorkspace(ctx, taskId);
    const existing = await this.loadResourceOnTask(taskId, resourceId);
    const isUploader = existing.uploadedById === actorId;
    const isModerator = ctx.role === Role.OWNER || ctx.role === Role.ADMIN;
    if (!isUploader && !isModerator) {
      throw new ForbiddenException(
        'You can only delete your own uploads (or moderate as owner/admin)',
      );
    }
    await this.prisma.resource.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  private async requireTaskInWorkspace(ctx: WorkspaceContext, taskId: string): Promise<void> {
    const found = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId: ctx.id },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Task not found');
  }

  private async loadResourceOnTask(taskId: string, resourceId: string): Promise<Resource> {
    const r = await this.prisma.resource.findUnique({ where: { id: resourceId } });
    if (!r || r.taskId !== taskId) {
      throw new NotFoundException('Resource not found');
    }
    return r;
  }
}
