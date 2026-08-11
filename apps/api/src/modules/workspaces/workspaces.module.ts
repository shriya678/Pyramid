import { Module } from '@nestjs/common';
import { WorkspaceMemberGuard } from './guards/workspace-member.guard';
import { WorkspaceMembersController } from './workspace-members.controller';
import { WorkspaceMembersService } from './workspace-members.service';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

/**
 * Workspaces module. PrismaService is available via the global PrismaModule,
 * so nothing to import here.
 *
 * WorkspaceMemberGuard is exported so downstream modules (tasks, projects,
 * statuses, labels) can apply it to their own routes without re-implementing
 * the membership check.
 *
 * WorkspaceMembersService is exported so the project-members flow can reuse
 * its user-by-email lookup and duplicate-detection helpers.
 */
@Module({
  controllers: [WorkspacesController, WorkspaceMembersController],
  providers: [WorkspacesService, WorkspaceMembersService, WorkspaceMemberGuard],
  exports: [WorkspacesService, WorkspaceMembersService, WorkspaceMemberGuard],
})
export class WorkspacesModule {}
