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
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import {
  WorkspaceMemberGuard,
  type WorkspaceContext,
} from '../workspaces/guards/workspace-member.guard';
import { CreateResourceDto } from './dto/create-resource.dto';
import { ResourcesService } from './resources.service';

@ApiTags('resources')
@ApiBearerAuth()
@UseGuards(WorkspaceMemberGuard)
@Controller('workspaces/:slug/tasks/:taskId/resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  @Get()
  @ApiOperation({ summary: 'List all resources (LINK + FILE) on the task' })
  list(@CurrentWorkspace() ws: WorkspaceContext, @Param('taskId') taskId: string) {
    return this.resourcesService.list(ws, taskId);
  }

  /**
   * Step 1 of the FILE upload flow. Rate-limited tighter than other endpoints
   * because signed uploads let clients push bytes at Cloudinary; a botnet
   * spraying this endpoint could rack up someone else's Cloudinary bill.
   */
  @Post('sign-upload')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60 * 1000 } })
  @ApiOperation({
    summary: 'Return signed Cloudinary upload params (for direct-from-browser upload).',
  })
  signUpload(@CurrentWorkspace() ws: WorkspaceContext, @Param('taskId') taskId: string) {
    return this.resourcesService.signUpload(ws, taskId);
  }

  @Post()
  @ApiOperation({
    summary:
      "Create a resource. LINK: send { type:'LINK', url, name }. FILE (after upload): { type:'FILE', cloudinaryKey, name, mimeType, sizeBytes }.",
  })
  create(
    @CurrentWorkspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId') taskId: string,
    @Body() dto: CreateResourceDto,
  ) {
    return this.resourcesService.create(ws, user.id, taskId, dto);
  }

  @Get(':id/url')
  @ApiOperation({
    summary: 'Signed 5-minute read URL for a FILE resource. LINK types return 400.',
  })
  getSignedReadUrl(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('taskId') taskId: string,
    @Param('id') id: string,
  ) {
    return this.resourcesService.getSignedReadUrl(ws, taskId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Delete a resource. Uploader OR workspace OWNER/ADMIN. Cloudinary asset stays orphaned (documented in README).',
  })
  delete(
    @CurrentWorkspace() ws: WorkspaceContext,
    @CurrentUser() user: AuthenticatedUser,
    @Param('taskId') taskId: string,
    @Param('id') id: string,
  ) {
    return this.resourcesService.delete(ws, user.id, taskId, id);
  }
}
