import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CurrentWorkspace } from './decorators/current-workspace.decorator';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceMemberGuard, type WorkspaceContext } from './guards/workspace-member.guard';
import { WorkspacesService } from './workspaces.service';

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  /**
   * All workspaces the current user is a member of. Used by the (P1)
   * multi-workspace switcher, but also fine as a "which one am I in" call.
   * No :slug in the URL so no WorkspaceMemberGuard needed.
   */
  @Get()
  @ApiOperation({ summary: 'List all workspaces the current user is a member of' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.workspacesService.listForUser(user.id);
  }

  /**
   * Detail for a single workspace. Guard validates membership; also attaches
   * the caller's role, which the response body echoes back for convenience.
   */
  @UseGuards(WorkspaceMemberGuard)
  @Get(':slug')
  @ApiOperation({ summary: 'Get workspace detail (403/404 if not a member)' })
  getBySlug(@CurrentWorkspace() ws: WorkspaceContext) {
    return this.workspacesService.getBySlug(ws);
  }

  /**
   * Rename. Service enforces OWNER-only; guard has already loaded the role.
   */
  @UseGuards(WorkspaceMemberGuard)
  @Patch(':slug')
  @ApiOperation({ summary: 'Rename a workspace (OWNER only)' })
  rename(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('slug') _slug: string,
    @Body() dto: UpdateWorkspaceDto,
  ) {
    return this.workspacesService.rename(ws, dto.name);
  }
}
