import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import {
  WorkspaceMemberGuard,
  type WorkspaceContext,
} from '../workspaces/guards/workspace-member.guard';
import { ActivityService } from './activity.service';

@ApiTags('activity')
@ApiBearerAuth()
@UseGuards(WorkspaceMemberGuard)
@Controller('workspaces/:slug/tasks/:taskId/activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  @ApiOperation({
    summary: 'Chronological activity feed for a task (newest first). Includes actor identity.',
  })
  list(@CurrentWorkspace() ws: WorkspaceContext, @Param('taskId') taskId: string) {
    return this.activityService.listForTask(ws, taskId);
  }
}
