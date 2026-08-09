import { Module } from '@nestjs/common';
import { WorkspaceMemberGuard } from './guards/workspace-member.guard';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

/**
 * Workspaces module. PrismaService is available via the global PrismaModule,
 * so nothing to import here.
 *
 * WorkspaceMemberGuard is exported so downstream modules (tasks, projects,
 * statuses, labels) can apply it to their own routes without re-implementing
 * the membership check.
 */
@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceMemberGuard],
  exports: [WorkspacesService, WorkspaceMemberGuard],
})
export class WorkspacesModule {}
