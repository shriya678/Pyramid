import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CurrentWorkspace } from './decorators/current-workspace.decorator';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { WorkspaceMemberGuard, type WorkspaceContext } from './guards/workspace-member.guard';
import { WorkspacesService } from './workspaces.service';

@ApiTags('workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  /**
   * All workspaces the current user is a member of. Used by the multi-workspace
   * switcher, but also fine as a "which one am I in" call. No :slug in the URL
   * so no WorkspaceMemberGuard needed.
   */
  @Get()
  @ApiOperation({ summary: 'List all workspaces the current user is a member of' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.workspacesService.listForUser(user.id);
  }

  /**
   * Create a new workspace. Caller becomes OWNER; the workspace gets default
   * statuses only (no seeded teammates / demo project).
   */
  @Post()
  @ApiOperation({ summary: 'Create a new workspace (caller becomes OWNER)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWorkspaceDto) {
    return this.workspacesService.create(user.id, dto.name);
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
   * Self-service leave. Cascades ProjectMember rows in this workspace and
   * drops the caller's WorkspaceMember row. Blocked for sole OWNER.
   */
  @UseGuards(WorkspaceMemberGuard)
  @Post(':slug/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave a workspace (blocked for the sole OWNER)' })
  leave(@CurrentWorkspace() ws: WorkspaceContext) {
    return this.workspacesService.leave(ws);
  }

  /**
   * Permanently delete a workspace. OWNER only. Cascades through every
   * workspace-scoped row (members, statuses, projects, tasks, labels + all
   * their subordinates). Irreversible.
   */
  @UseGuards(WorkspaceMemberGuard)
  @Delete(':slug')
  @ApiOperation({ summary: 'Delete a workspace and all its data (OWNER only)' })
  remove(@CurrentWorkspace() ws: WorkspaceContext) {
    return this.workspacesService.delete(ws);
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
