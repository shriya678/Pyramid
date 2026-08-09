import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { WorkspaceResponse } from './dto/workspace-response.dto';
import type { WorkspaceContext } from './guards/workspace-member.guard';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lists all workspaces the given user is a member of, most recently joined
   * first. Small list per user in practice (auto-seeded workspace + any they
   * later create), so no pagination.
   */
  async listForUser(userId: string): Promise<WorkspaceResponse[]> {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId },
      orderBy: { joinedAt: 'desc' },
      select: {
        role: true,
        workspace: {
          select: { id: true, slug: true, name: true, createdAt: true, updatedAt: true },
        },
      },
    });
    return memberships.map((m) => ({
      id: m.workspace.id,
      slug: m.workspace.slug,
      name: m.workspace.name,
      role: m.role,
      createdAt: m.workspace.createdAt.toISOString(),
      updatedAt: m.workspace.updatedAt.toISOString(),
    }));
  }

  /**
   * Detail view for a workspace the user has access to. The guard has already
   * validated membership by the time this runs — we just fetch the timestamps.
   */
  async getBySlug(ctx: WorkspaceContext): Promise<WorkspaceResponse> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: ctx.id },
      select: { id: true, slug: true, name: true, createdAt: true, updatedAt: true },
    });
    if (!ws) {
      // Shouldn't happen if the guard passed, but defensive.
      throw new NotFoundException('Workspace not found');
    }
    return {
      id: ws.id,
      slug: ws.slug,
      name: ws.name,
      role: ctx.role,
      createdAt: ws.createdAt.toISOString(),
      updatedAt: ws.updatedAt.toISOString(),
    };
  }

  /**
   * Rename. OWNER-only for now — ADMIN role exists in the schema but no
   * flow currently grants it, so functionally OWNER === "the sole editor".
   */
  async rename(ctx: WorkspaceContext, name: string): Promise<WorkspaceResponse> {
    if (ctx.role !== Role.OWNER) {
      throw new ForbiddenException('Only the workspace owner can rename it');
    }
    const updated = await this.prisma.workspace.update({
      where: { id: ctx.id },
      data: { name },
      select: { id: true, slug: true, name: true, createdAt: true, updatedAt: true },
    });
    return {
      id: updated.id,
      slug: updated.slug,
      name: updated.name,
      role: ctx.role,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }
}
