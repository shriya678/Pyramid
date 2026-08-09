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
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import {
  WorkspaceMemberGuard,
  type WorkspaceContext,
} from '../workspaces/guards/workspace-member.guard';
import { CreateStatusDto } from './dto/create-status.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { StatusesService } from './statuses.service';

@ApiTags('statuses')
@ApiBearerAuth()
@UseGuards(WorkspaceMemberGuard)
@Controller('workspaces/:slug/statuses')
export class StatusesController {
  constructor(private readonly statusesService: StatusesService) {}

  @Get()
  @ApiOperation({ summary: 'List statuses in column order' })
  list(@CurrentWorkspace() ws: WorkspaceContext) {
    return this.statusesService.list(ws);
  }

  @Post()
  @ApiOperation({ summary: 'Create a status (OWNER or ADMIN)' })
  create(@CurrentWorkspace() ws: WorkspaceContext, @Body() dto: CreateStatusDto) {
    return this.statusesService.create(ws, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update name/color/order (OWNER or ADMIN)' })
  update(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.statusesService.update(ws, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a status. If it has tasks, ?moveTo=<statusId> is required.',
  })
  delete(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('id') id: string,
    @Query('moveTo') moveTo?: string,
  ) {
    return this.statusesService.delete(ws, id, moveTo);
  }
}
