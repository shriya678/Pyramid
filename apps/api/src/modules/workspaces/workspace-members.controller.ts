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
import { CurrentWorkspace } from './decorators/current-workspace.decorator';
import { AddWorkspaceMemberDto } from './dto/add-workspace-member.dto';
import { WorkspaceMemberGuard, type WorkspaceContext } from './guards/workspace-member.guard';
import { WorkspaceMembersService } from './workspace-members.service';

@ApiTags('workspace-members')
@ApiBearerAuth()
@UseGuards(WorkspaceMemberGuard)
@Controller('workspaces/:slug/members')
export class WorkspaceMembersController {
  constructor(private readonly members: WorkspaceMembersService) {}

  @Get()
  @ApiOperation({
    summary: 'List every member of the workspace (any workspace member can call).',
  })
  list(@CurrentWorkspace() ws: WorkspaceContext) {
    return this.members.list(ws);
  }

  @Post()
  @ApiOperation({
    summary:
      'Add a real user to the workspace by email as MEMBER or ADMIN (OWNER/ADMIN only). ' +
      'Invitee must already have an account. 409 if already a member.',
  })
  add(@CurrentWorkspace() ws: WorkspaceContext, @Body() dto: AddWorkspaceMemberDto) {
    return this.members.add(ws, dto);
  }

  @Delete(':userId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Remove a member (OWNER/ADMIN only). Blocks self-remove and sole-OWNER-remove. ' +
      'Also cascades their ProjectMember rows in this workspace.',
  })
  remove(@CurrentWorkspace() ws: WorkspaceContext, @Param('userId') userId: string) {
    return this.members.remove(ws, userId);
  }
}
