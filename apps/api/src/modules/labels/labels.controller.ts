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
import { CurrentWorkspace } from '../workspaces/decorators/current-workspace.decorator';
import {
  WorkspaceMemberGuard,
  type WorkspaceContext,
} from '../workspaces/guards/workspace-member.guard';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';
import { LabelsService } from './labels.service';

@ApiTags('labels')
@ApiBearerAuth()
@UseGuards(WorkspaceMemberGuard)
@Controller('workspaces/:slug/labels')
export class LabelsController {
  constructor(private readonly labelsService: LabelsService) {}

  @Get()
  @ApiOperation({ summary: 'List labels alphabetically' })
  list(@CurrentWorkspace() ws: WorkspaceContext) {
    return this.labelsService.list(ws);
  }

  @Post()
  @ApiOperation({ summary: 'Create a label (OWNER or ADMIN)' })
  create(@CurrentWorkspace() ws: WorkspaceContext, @Body() dto: CreateLabelDto) {
    return this.labelsService.create(ws, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename or recolor a label (OWNER or ADMIN)' })
  update(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('id') id: string,
    @Body() dto: UpdateLabelDto,
  ) {
    return this.labelsService.update(ws, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a label. TaskLabel join rows cascade; tasks keep existing.',
  })
  delete(@CurrentWorkspace() ws: WorkspaceContext, @Param('id') id: string) {
    return this.labelsService.delete(ws, id);
  }
}
