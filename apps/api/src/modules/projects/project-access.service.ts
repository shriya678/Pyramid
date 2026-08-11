import { Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';

/**
 * Single source of truth for the two-tier access model:
 *
 *   Tier 1 (workspace):  WorkspaceMemberGuard validates the URL slug maps to
 *                        a WorkspaceMember row and attaches ctx.
 *   Tier 2 (project):    this service scopes reads/writes based on ctx.role.
 *
 *     OWNER / ADMIN / MEMBER  →  see every project in the workspace,
 *                                orphan tasks (projectId=null) included.
 *     COLLABORATOR            →  see only projects with a ProjectMember row,
 *                                no orphan tasks.
 *
 * Every read/write endpoint that touches a project, task, comment, or
 * resource must run its ids through here — never trust client-supplied ids
 * past this gate. All denials return 404 (not 403) so we don't leak the
 * existence of things the caller can't see.
 */
@Injectable()
export class ProjectAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the set of project ids the caller may see, or `null` meaning
   * "no filter — they see every project in the workspace".
   *
   * Usage in a list query:
   *   const ids = await access.getVisibleProjectIds(ctx);
   *   const where: Prisma.ProjectWhereInput = { workspaceId: ctx.id };
   *   if (ids !== null) where.id = { in: ids };
   */
  async getVisibleProjectIds(ctx: WorkspaceContext): Promise<string[] | null> {
    if (ctx.role !== Role.COLLABORATOR) return null;
    const rows = await this.prisma.projectMember.findMany({
      where: { userId: ctx.userId, project: { workspaceId: ctx.id } },
      select: { projectId: true },
    });
    return rows.map((r) => r.projectId);
  }

  /**
   * Throws 404 if the caller cannot access `projectId` in this workspace.
   * Returns silently on success.
   */
  async assertCanAccessProject(ctx: WorkspaceContext, projectId: string): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });
    if (!project || project.workspaceId !== ctx.id) {
      throw new NotFoundException('Project not found');
    }
    if (ctx.role === Role.COLLABORATOR) {
      const member = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: ctx.userId } },
        select: { projectId: true },
      });
      if (!member) throw new NotFoundException('Project not found');
    }
  }

  /**
   * Throws 404 if the caller cannot access `task` (workspace mismatch, or
   * COLLABORATOR without membership in the task's project, or COLLABORATOR
   * looking at an orphan task). Sync — accepts the already-loaded task
   * shape so callers do their own findUnique and reuse the result.
   */
  async assertCanAccessTask(
    ctx: WorkspaceContext,
    task: { workspaceId: string; projectId: string | null },
  ): Promise<void> {
    if (task.workspaceId !== ctx.id) {
      throw new NotFoundException('Task not found');
    }
    if (ctx.role !== Role.COLLABORATOR) return;
    if (!task.projectId) {
      // Orphan tasks aren't COLLABORATOR-visible.
      throw new NotFoundException('Task not found');
    }
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: task.projectId, userId: ctx.userId } },
      select: { projectId: true },
    });
    if (!member) throw new NotFoundException('Task not found');
  }
}
