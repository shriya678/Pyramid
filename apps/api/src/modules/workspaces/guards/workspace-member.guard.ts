import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';

/**
 * Resolved workspace context attached to `req.workspace` after this guard runs.
 * Downstream handlers pull it via @CurrentWorkspace().
 */
export interface WorkspaceContext {
  id: string;
  slug: string;
  name: string;
  role: Role;
}

/**
 * Reads `:slug` from the URL param, checks the current user is a
 * WorkspaceMember, and attaches `req.workspace`. Returns 404 (not 403) when
 * the workspace doesn't exist or the user isn't a member, so we don't leak
 * existence of workspaces the user can't see.
 *
 * Applied per-controller (not global) so only routes that actually need
 * a workspace context opt in.
 */
@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser; workspace?: WorkspaceContext }>();

    const user = req.user;
    if (!user) {
      // JwtAuthGuard should have populated this. If it hasn't, we're being
      // used on a route that isn't authenticated — misuse, fail loudly.
      throw new ForbiddenException('Workspace access requires authentication');
    }

    const slug = req.params?.['slug'];
    if (!slug || typeof slug !== 'string') {
      throw new ForbiddenException('Workspace slug missing from route');
    }

    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        userId: user.id,
        workspace: { slug },
      },
      select: {
        role: true,
        workspace: { select: { id: true, slug: true, name: true } },
      },
    });

    if (!membership) {
      // Deliberately 404 for both "workspace doesn't exist" and "you're not a
      // member" to avoid leaking existence.
      throw new NotFoundException('Workspace not found');
    }

    req.workspace = {
      id: membership.workspace.id,
      slug: membership.workspace.slug,
      name: membership.workspace.name,
      role: membership.role,
    };

    return true;
  }
}
