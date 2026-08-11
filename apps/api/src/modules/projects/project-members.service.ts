import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AddProjectMemberDto } from './dto/add-project-member.dto';
import type {
  AddProjectMemberResult,
  ProjectMemberResponse,
  ProjectMemberUser,
} from './dto/project-member-response.dto';
import type { WorkspaceContext } from '../workspaces/guards/workspace-member.guard';

const USER_SELECT = {
  id: true,
  email: true,
  username: true,
  fullName: true,
  avatarUrl: true,
  isGuest: true,
  isSeeded: true,
} as const;

type ProjectMemberRow = {
  projectId: string;
  userId: string;
  addedById: string;
  addedAt: Date;
  user: ProjectMemberUser;
};

const toResponse = (row: ProjectMemberRow, workspaceRole: Role): ProjectMemberResponse => ({
  projectId: row.projectId,
  userId: row.userId,
  addedById: row.addedById,
  addedAt: row.addedAt.toISOString(),
  workspaceRole,
  user: row.user,
});

@Injectable()
export class ProjectMembersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List everyone with visibility of this project. That's the union of:
   *   - workspace OWNER/ADMIN/MEMBER (via WorkspaceMember)
   *   - explicit ProjectMember rows (which will only exist for COLLABORATORs
   *     in practice, since the add endpoint never inserts one for O/A/M)
   *
   * Returned as a flat list with each row's `workspaceRole` populated, so the
   * UI can render "Alice (Owner)" alongside "Alex (Collaborator, added by
   * Priya)".
   *
   * Any workspace member can list.
   */
  async list(ctx: WorkspaceContext, projectId: string): Promise<ProjectMemberResponse[]> {
    await this.requireProjectInWorkspace(ctx, projectId);

    // Workspace tier: OWNER/ADMIN/MEMBER always have access. Excludes
    // COLLABORATOR since they only have access when they're also in
    // ProjectMember — which the next query pulls in explicitly.
    const wsMembers = await this.prisma.workspaceMember.findMany({
      where: {
        workspaceId: ctx.id,
        role: { in: [Role.OWNER, Role.ADMIN, Role.MEMBER] },
      },
      select: {
        userId: true,
        role: true,
        joinedAt: true,
        user: { select: USER_SELECT },
      },
    });

    // Project tier: COLLABORATOR rows explicitly granted to this project.
    const pmRows = await this.prisma.projectMember.findMany({
      where: { projectId },
      select: {
        projectId: true,
        userId: true,
        addedById: true,
        addedAt: true,
        user: { select: USER_SELECT },
      },
    });

    // Fold into a single deduplicated list keyed by userId. Workspace-tier
    // wins on conflict (same user in both) — they'd never both be there in
    // practice per the add-endpoint rule.
    const seen = new Set<string>();
    const out: ProjectMemberResponse[] = [];

    for (const pm of pmRows) {
      if (seen.has(pm.userId)) continue;
      seen.add(pm.userId);
      out.push({
        projectId: pm.projectId,
        userId: pm.userId,
        addedById: pm.addedById,
        addedAt: pm.addedAt.toISOString(),
        workspaceRole: Role.COLLABORATOR,
        user: pm.user,
      });
    }

    for (const wm of wsMembers) {
      if (seen.has(wm.userId)) continue;
      seen.add(wm.userId);
      out.push({
        projectId,
        userId: wm.userId,
        addedById: wm.userId, // workspace members weren't "added to" the project
        addedAt: wm.joinedAt.toISOString(),
        workspaceRole: wm.role,
        user: wm.user,
      });
    }

    return out;
  }

  /**
   * Add a user to a project by email. OWNER/ADMIN only.
   *
   *   - 400 if no User exists with that email
   *   - 200 with `{ alreadyHasAccess: true }` if they're already
   *     OWNER/ADMIN/MEMBER of the workspace (no ProjectMember row inserted)
   *   - 409 if they're already a COLLABORATOR of this project specifically
   *   - Otherwise: creates a COLLABORATOR WorkspaceMember row (if none) plus
   *     a ProjectMember row, and returns `{ alreadyHasAccess: false, ... }`.
   */
  async add(
    ctx: WorkspaceContext,
    projectId: string,
    dto: AddProjectMemberDto,
  ): Promise<AddProjectMemberResult> {
    this.requireInviter(ctx);
    await this.requireProjectInWorkspace(ctx, projectId);

    const invitee = await this.findUserByEmail(dto.email);

    const existingWs = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: ctx.id, userId: invitee.id } },
      select: { role: true },
    });

    // Case 1: already OWNER/ADMIN/MEMBER → no work needed.
    if (
      existingWs &&
      (existingWs.role === Role.OWNER ||
        existingWs.role === Role.ADMIN ||
        existingWs.role === Role.MEMBER)
    ) {
      return {
        alreadyHasAccess: true,
        workspaceRole: existingWs.role,
        user: invitee,
      };
    }

    // Case 2: already a COLLABORATOR — check whether they're already in this
    // specific project.
    if (existingWs?.role === Role.COLLABORATOR) {
      const existingPm = await this.prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: invitee.id } },
        select: { projectId: true },
      });
      if (existingPm) {
        throw new ConflictException('User is already a collaborator on this project');
      }
      // Add them to this project as well.
      const created = await this.createProjectMemberRow(projectId, invitee.id, ctx.userId);
      return {
        alreadyHasAccess: false,
        implicitWorkspaceAdd: false,
        member: toResponse(created, Role.COLLABORATOR),
      };
    }

    // Case 3: not a workspace member at all — create BOTH rows atomically.
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.workspaceMember.create({
        data: {
          workspaceId: ctx.id,
          userId: invitee.id,
          role: Role.COLLABORATOR,
        },
      });
      return tx.projectMember.create({
        data: {
          projectId,
          userId: invitee.id,
          addedById: ctx.userId,
        },
        select: {
          projectId: true,
          userId: true,
          addedById: true,
          addedAt: true,
          user: { select: USER_SELECT },
        },
      });
    });
    return {
      alreadyHasAccess: false,
      implicitWorkspaceAdd: true,
      member: toResponse(created, Role.COLLABORATOR),
    };
  }

  /**
   * Remove a user from a project. OWNER/ADMIN only.
   *
   *   - 400 if the caller removes themselves
   *   - 404 if the user has no ProjectMember row for this project
   *   - Does NOT remove them from the workspace — a COLLABORATOR who loses
   *     their last project this way just has an empty workspace view; the
   *     workspace-remove flow is the way to fully evict.
   */
  async remove(ctx: WorkspaceContext, projectId: string, userId: string): Promise<{ ok: true }> {
    this.requireInviter(ctx);
    await this.requireProjectInWorkspace(ctx, projectId);
    if (userId === ctx.userId) {
      throw new BadRequestException('You cannot remove yourself from a project');
    }
    const existing = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: { projectId: true },
    });
    if (!existing) {
      // Could be an O/A/M who was never in ProjectMember to begin with. From
      // the client's perspective they weren't "in" this project's members
      // list as a collaborator, so 404 is honest.
      throw new NotFoundException('Project member not found');
    }
    await this.prisma.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private requireInviter(ctx: WorkspaceContext): void {
    if (ctx.role !== Role.OWNER && ctx.role !== Role.ADMIN) {
      throw new ForbiddenException('Only workspace owners or admins can manage project members');
    }
  }

  private async requireProjectInWorkspace(ctx: WorkspaceContext, projectId: string): Promise<void> {
    const found = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });
    if (!found || found.workspaceId !== ctx.id) {
      throw new NotFoundException('Project not found');
    }
  }

  private async findUserByEmail(email: string): Promise<ProjectMemberUser> {
    const normalised = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalised },
      select: USER_SELECT,
    });
    if (!user) {
      throw new BadRequestException('User not found — they must sign up first');
    }
    return user;
  }

  private async createProjectMemberRow(
    projectId: string,
    userId: string,
    addedById: string,
  ): Promise<ProjectMemberRow> {
    return this.prisma.projectMember.create({
      data: { projectId, userId, addedById },
      select: {
        projectId: true,
        userId: true,
        addedById: true,
        addedAt: true,
        user: { select: USER_SELECT },
      },
    });
  }
}
