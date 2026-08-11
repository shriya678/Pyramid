import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import {
  WorkspaceMemberGuard,
  type WorkspaceContext,
} from '../workspaces/guards/workspace-member.guard';
import { AddProjectMemberDto } from './dto/add-project-member.dto';
import { ProjectMembersService } from './project-members.service';

@ApiTags('project-members')
@ApiBearerAuth()
@UseGuards(WorkspaceMemberGuard)
@Controller('workspaces/:slug/projects/:projectId/members')
export class ProjectMembersController {
  constructor(private readonly members: ProjectMembersService) {}

  @Get()
  @ApiOperation({
    summary:
      'List everyone with access to this project — workspace OWNER/ADMIN/MEMBER (via workspace tier) plus explicit COLLABORATORs (via ProjectMember). Any workspace member can call.',
  })
  list(@CurrentWorkspace() ws: WorkspaceContext, @Param('projectId') projectId: string) {
    return this.members.list(ws, projectId);
  }

  @Post()
  @ApiOperation({
    summary:
      'Add a user by email to the project (OWNER/ADMIN only). If the invitee has no workspace membership yet, a COLLABORATOR row is created for them implicitly. Existing OWNER/ADMIN/MEMBER returns { alreadyHasAccess: true } (no row inserted). Existing COLLABORATOR already on this project → 409.',
  })
  add(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('projectId') projectId: string,
    @Body() dto: AddProjectMemberDto,
  ) {
    return this.members.add(ws, projectId, dto);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Remove a user from this project (OWNER/ADMIN only). Does NOT remove them from the workspace — use the workspace-remove endpoint for that. 400 if removing yourself, 404 if they have no ProjectMember row for this project.',
  })
  remove(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
  ) {
    return this.members.remove(ws, projectId, userId);
  }
}
