import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WorkspaceProvisioningService } from '../auth/workspace-provisioning.service';
import type { WorkspaceResponse } from './dto/workspace-response.dto';
import type { WorkspaceContext } from './guards/workspace-member.guard';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provisioning: WorkspaceProvisioningService,
  ) {}

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
   * User-invoked workspace creation. The caller becomes OWNER; the workspace
   * gets default statuses only (no seeded teammates / demo project — that's
   * reserved for first-login provisioning).
   */
  async create(userId: string, name: string): Promise<WorkspaceResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, fullName: true, username: true },
    });
    const ws = await this.provisioning.provisionCore(user, { name, slugSeed: name });
    return {
      id: ws.id,
      slug: ws.slug,
      name: ws.name,
      role: Role.OWNER,
      createdAt: ws.createdAt.toISOString(),
      updatedAt: ws.updatedAt.toISOString(),
    };
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
   * Self-service leave. The caller removes their own membership from this
   * workspace. Blocked for the sole OWNER — they would orphan the workspace
   * (they'd need to delete it instead, which isn't wired up yet). Cascades
   * their ProjectMember rows in this workspace so a later re-invite as a
   * different role doesn't inherit stale project access.
   */
  async leave(ctx: WorkspaceContext): Promise<{ ok: true }> {
    if (ctx.role === Role.OWNER) {
      const ownerCount = await this.prisma.workspaceMember.count({
        where: { workspaceId: ctx.id, role: Role.OWNER },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException(
          'You are the sole owner of this workspace. Transfer ownership or delete the workspace instead.',
        );
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.projectMember.deleteMany({
        where: { userId: ctx.userId, project: { workspaceId: ctx.id } },
      });
      await tx.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId: ctx.id, userId: ctx.userId } },
      });
    });
    return { ok: true };
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
