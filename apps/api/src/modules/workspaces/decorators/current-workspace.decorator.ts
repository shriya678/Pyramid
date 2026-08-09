import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { WorkspaceContext } from '../guards/workspace-member.guard';

/**
 * Param decorator that returns the workspace context resolved by
 * WorkspaceMemberGuard. Only meaningful inside handlers protected by that
 * guard — otherwise the request has no `.workspace` and this throws.
 *
 * Usage:
 *   @UseGuards(WorkspaceMemberGuard)
 *   @Get(':slug/tasks')
 *   list(@CurrentWorkspace() ws: WorkspaceContext) { ... }
 */
export const CurrentWorkspace = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): WorkspaceContext => {
    const req = ctx.switchToHttp().getRequest<Request & { workspace?: WorkspaceContext }>();
    if (!req.workspace) {
      throw new Error('CurrentWorkspace decorator used on a route without WorkspaceMemberGuard');
    }
    return req.workspace;
  },
);
