import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Priority, Role, type Prisma, type Project } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectAccessService } from './project-access.service';

export interface ProjectResponse {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  priority: Priority;
  leadUserId: string | null;
  dueDate: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

const toResponse = (p: Project): ProjectResponse => ({
  id: p.id,
  workspaceId: p.workspaceId,
  name: p.name,
  description: p.description,
  priority: p.priority,
  leadUserId: p.leadUserId,
  dueDate: p.dueDate?.toISOString() ?? null,
  orderIndex: p.orderIndex,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
  ) {}

  async list(ctx: WorkspaceContext): Promise<ProjectResponse[]> {
    const where: Prisma.ProjectWhereInput = { workspaceId: ctx.id };
    const visible = await this.access.getVisibleProjectIds(ctx);
    if (visible !== null) where.id = { in: visible };
    const rows = await this.prisma.project.findMany({
      where,
      orderBy: { orderIndex: 'asc' },
    });
    return rows.map(toResponse);
  }

  async getById(ctx: WorkspaceContext, projectId: string): Promise<ProjectResponse> {
    await this.access.assertCanAccessProject(ctx, projectId);
    const row = await this.loadInWorkspace(ctx, projectId);
    return toResponse(row);
  }

  /**
   * Create. OWNER/ADMIN/MEMBER only — a COLLABORATOR is scoped to specific
   * projects and shouldn't be creating workspace-wide ones.
   */
  async create(ctx: WorkspaceContext, dto: CreateProjectDto): Promise<ProjectResponse> {
    if (ctx.role === Role.COLLABORATOR) {
      throw new ForbiddenException('Collaborators cannot create projects');
    }
    if (dto.leadUserId) {
      await this.requireLeadIsMember(ctx, dto.leadUserId);
    }

    const orderIndex =
      dto.orderIndex ??
      ((
        await this.prisma.project.findFirst({
          where: { workspaceId: ctx.id },
          orderBy: { orderIndex: 'desc' },
          select: { orderIndex: true },
        })
      )?.orderIndex ?? 0) + 1000;

    const created = await this.prisma.project.create({
      data: {
        workspaceId: ctx.id,
        name: dto.name,
        description: dto.description ?? null,
        priority: dto.priority ?? Priority.NONE,
        leadUserId: dto.leadUserId ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        orderIndex,
      },
    });
    return toResponse(created);
  }

  /**
   * Update. OWNER/ADMIN only. `null` on leadUserId or dueDate means clear;
   * `undefined` (field omitted) means "no change".
   */
  async update(
    ctx: WorkspaceContext,
    projectId: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectResponse> {
    this.requireEditor(ctx);
    const existing = await this.loadInWorkspace(ctx, projectId);
    if (dto.leadUserId) {
      await this.requireLeadIsMember(ctx, dto.leadUserId);
    }

    const data: Prisma.ProjectUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.leadUserId !== undefined) {
      data.leadUser = dto.leadUserId ? { connect: { id: dto.leadUserId } } : { disconnect: true };
    }
    if (dto.dueDate !== undefined) {
      data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }
    if (dto.orderIndex !== undefined) data.orderIndex = dto.orderIndex;

    const updated = await this.prisma.project.update({
      where: { id: existing.id },
      data,
    });
    return toResponse(updated);
  }

  /**
   * Delete. OWNER/ADMIN only. Prisma's onDelete: SetNull on Task.projectId
   * means the project's tasks survive orphaned; they show up under the
   * workspace's Tasks view without a project pill.
   */
  async delete(ctx: WorkspaceContext, projectId: string): Promise<{ ok: true }> {
    this.requireEditor(ctx);
    const existing = await this.loadInWorkspace(ctx, projectId);
    await this.prisma.project.delete({ where: { id: existing.id } });
    return { ok: true };
  }

  private async loadInWorkspace(ctx: WorkspaceContext, projectId: string): Promise<Project> {
    const row = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!row || row.workspaceId !== ctx.id) {
      throw new NotFoundException('Project not found');
    }
    return row;
  }

  /**
   * Enforce that a proposed lead is actually a member of this workspace.
   * Returns 400 (not 404) — the request shape is wrong, not a missing resource.
   */
  private async requireLeadIsMember(ctx: WorkspaceContext, userId: string): Promise<void> {
    const member = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId: ctx.id, userId },
      select: { userId: true },
    });
    if (!member) {
      throw new BadRequestException(`leadUserId ${userId} is not a member of this workspace`);
    }
  }

  private requireEditor(ctx: WorkspaceContext): void {
    if (ctx.role !== Role.OWNER && ctx.role !== Role.ADMIN) {
      throw new ForbiddenException('Only workspace owners or admins can modify or delete projects');
    }
  }
}
