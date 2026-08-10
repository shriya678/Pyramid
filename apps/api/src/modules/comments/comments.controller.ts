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
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import {
  WorkspaceMemberGuard,
  type WorkspaceContext,
} from '../workspaces/guards/workspace-member.guard';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@ApiTags('comments')
@ApiBearerAuth()
@UseGuards(WorkspaceMemberGuard)
@Controller('workspaces/:slug/tasks/:taskId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  @ApiOperation({
    summary:
      'List all comments on a task. Top-level in chronological order; each includes its replies nested.',
  })
  list(@CurrentWorkspace() ws: WorkspaceContext, @Param('taskId') taskId: string) {
    return this.commentsService.listForTask(ws, taskId);
  }

  @Post()
  @ApiOperation({
    summary: 'Post a comment (or a reply if parentCommentId is set). Any workspace member.',
  })
  create(
    @CurrentWorkspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId') taskId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentsService.create(ws, user.id, taskId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit comment body. Author only (even moderators cannot rewrite).' })
  update(
    @CurrentWorkspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId') taskId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.commentsService.update(ws, user.id, taskId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a comment. Author OR workspace OWNER/ADMIN (moderation).',
  })
  delete(
    @CurrentWorkspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId') taskId: string,
    @Param('id') id: string,
  ) {
    return this.commentsService.delete(ws, user.id, taskId, id);
  }
}
