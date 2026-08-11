import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, type Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AddWorkspaceMemberDto } from './dto/add-workspace-member.dto';
import type {
  WorkspaceMemberResponse,
  WorkspaceMemberUser,
} from './dto/workspace-member-response.dto';
import type { WorkspaceContext } from './guards/workspace-member.guard';

const USER_SELECT = {
  id: true,
  email: true,
  username: true,
  fullName: true,
  avatarUrl: true,
  isGuest: true,
  isSeeded: true,
} as const;

type MembershipRow = {
  workspaceId: string;
  userId: string;
  role: Role;
  joinedAt: Date;
  user: WorkspaceMemberUser;
};

const toResponse = (row: MembershipRow): WorkspaceMemberResponse => ({
  workspaceId: row.workspaceId,
  userId: row.userId,
  role: row.role,
  joinedAt: row.joinedAt.toISOString(),
  user: row.user,
});

@Injectable()
export class WorkspaceMembersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List everyone with a WorkspaceMember row for this workspace. Any member
   * (including COLLABORATOR) can see the roster — it's how the assignee
   * picker + project-members-panel populates who's inviteable to a project.
   */
  async list(ctx: WorkspaceContext): Promise<WorkspaceMemberResponse[]> {
    const rows = await this.prisma.workspaceMember.findMany({
      where: { workspaceId: ctx.id },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
      select: {
        workspaceId: true,
        userId: true,
        role: true,
        joinedAt: true,
        user: { select: USER_SELECT },
      },
    });
    return rows.map(toResponse);
  }

  /**
   * Add a real user to the workspace by email. OWNER/ADMIN only.
   *
   *   - 400 if role is anything other than MEMBER/ADMIN (DTO enforces this too)
   *   - 400 if no User exists with that email — invitee must sign up first
   *   - 409 if that user is already any kind of member (including OWNER)
   */
  async add(ctx: WorkspaceContext, dto: AddWorkspaceMemberDto): Promise<WorkspaceMemberResponse> {
    this.requireInviter(ctx);
    const invitee = await this.findUserByEmail(dto.email);
    const existing = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: ctx.id, userId: invitee.id } },
      select: { role: true },
    });
    if (existing) {
      throw new ConflictException(
        `User is already a ${existing.role.toLowerCase()} of this workspace`,
      );
    }
    const created = await this.prisma.workspaceMember.create({
      data: {
        workspaceId: ctx.id,
        userId: invitee.id,
        role: dto.role, // DTO restricts to MEMBER | ADMIN
      },
      select: {
        workspaceId: true,
        userId: true,
        role: true,
        joinedAt: true,
        user: { select: USER_SELECT },
      },
    });
    return toResponse(created);
  }

  /**
   * Remove a member. OWNER/ADMIN only.
   *
   *   - 400 if the caller tries to remove themselves (use "Leave workspace" —
   *     which doesn't exist yet, but we still block the footgun)
   *   - 400 if removing the last OWNER (would orphan the workspace)
   *   - 404 if that userId isn't a member
   */
  async remove(ctx: WorkspaceContext, userId: string): Promise<{ ok: true }> {
    this.requireInviter(ctx);
    if (userId === ctx.userId) {
      throw new BadRequestException(
        'You cannot remove yourself — leave the workspace from settings instead',
      );
    }
    const target = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: ctx.id, userId } },
      select: { role: true },
    });
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === Role.OWNER) {
      // Belt-and-suspenders — the sole-owner check below is the real gate,
      // but blocking any OWNER-removal keeps ownership transfer explicit.
      const ownerCount = await this.prisma.workspaceMember.count({
        where: { workspaceId: ctx.id, role: Role.OWNER },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException('Cannot remove the sole owner of the workspace');
      }
    }
    // Cascade delete of ProjectMember rows for this user in this workspace
    // — otherwise a COLLABORATOR who gets re-invited as MEMBER later could
    // end up with stale ProjectMember rows referencing already-removed access.
    await this.prisma.$transaction(async (tx) => {
      await tx.projectMember.deleteMany({
        where: { userId, project: { workspaceId: ctx.id } },
      });
      await tx.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId: ctx.id, userId } },
      });
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private requireInviter(ctx: WorkspaceContext): void {
    if (ctx.role !== Role.OWNER && ctx.role !== Role.ADMIN) {
      throw new ForbiddenException('Only workspace owners or admins can manage members');
    }
  }

  private async findUserByEmail(email: string): Promise<{ id: string }> {
    const normalised = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalised },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException('User not found — they must sign up first');
    }
    return user;
  }
}

/** Exported so the project-members flow can reuse the same shared shape. */
export const WORKSPACE_MEMBER_SELECT = {
  workspaceId: true,
  userId: true,
  role: true,
  joinedAt: true,
  user: { select: USER_SELECT },
} satisfies Prisma.WorkspaceMemberSelect;
