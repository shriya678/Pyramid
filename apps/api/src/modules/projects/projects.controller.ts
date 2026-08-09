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
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@UseGuards(WorkspaceMemberGuard)
@Controller('workspaces/:slug/projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List projects ordered by orderIndex asc' })
  list(@CurrentWorkspace() ws: WorkspaceContext) {
    return this.projectsService.list(ws);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a project by id' })
  getById(@CurrentWorkspace() ws: WorkspaceContext, @Param('id') id: string) {
    return this.projectsService.getById(ws, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a project (any workspace member)' })
  create(@CurrentWorkspace() ws: WorkspaceContext, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(ws, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update project fields (OWNER/ADMIN). null leadUserId or dueDate = clear.',
  })
  update(
    @CurrentWorkspace() ws: WorkspaceContext,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(ws, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a project (OWNER/ADMIN). Its tasks lose projectId (SetNull) but survive.',
  })
  delete(@CurrentWorkspace() ws: WorkspaceContext, @Param('id') id: string) {
    return this.projectsService.delete(ws, id);
  }
}
