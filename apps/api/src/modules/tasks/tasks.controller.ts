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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import {
  WorkspaceMemberGuard,
  type WorkspaceContext,
} from '../workspaces/guards/workspace-member.guard';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskListQueryDto } from './dto/task-list-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@ApiBearerAuth()
@UseGuards(WorkspaceMemberGuard)
@Controller('workspaces/:slug/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @ApiOperation({
    summary:
      'List tasks with optional filters. Defaults to top-level (parentTaskId=null). Pass ?parentTaskId=<id> for subtasks, or ?parentTaskId=any to bypass.',
  })
  list(@CurrentWorkspace() ws: WorkspaceContext, @Query() query: TaskListQueryDto) {
    return this.tasksService.list(ws, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Task detail with assignees, labels, subtask count' })
  getById(@CurrentWorkspace() ws: WorkspaceContext, @Param('id') id: string) {
    return this.tasksService.getById(ws, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a task (any workspace member). Reporter = caller.' })
  create(
    @CurrentWorkspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(ws, user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Update task. Any member. null on projectId/dueDate/startDate clears; assigneeIds/labelIds arrays replace the set (diff logged to activity).',
  })
  update(
    @CurrentWorkspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(ws, user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a task. Subtasks, assignees, labels, comments, resources, activity cascade.',
  })
  delete(@CurrentWorkspace() ws: WorkspaceContext, @Param('id') id: string) {
    return this.tasksService.delete(ws, id);
  }
}
