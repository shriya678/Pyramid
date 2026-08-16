import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkspaceMemberGuard } from './guards/workspace-member.guard';
import { WorkspaceMembersController } from './workspace-members.controller';
import { WorkspaceMembersService } from './workspace-members.service';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

/**
 * Workspaces module. PrismaService is available via the global PrismaModule,
 * so nothing else to import for storage.
 *
 * AuthModule is imported for `WorkspaceProvisioningService`, used by the
 * user-invoked create-workspace endpoint.
 *
 * WorkspaceMemberGuard is exported so downstream modules (tasks, projects,
 * statuses, labels) can apply it to their own routes without re-implementing
 * the membership check.
 *
 * WorkspaceMembersService is exported so the project-members flow can reuse
 * its user-by-email lookup and duplicate-detection helpers.
 */
@Module({
  imports: [AuthModule],
  controllers: [WorkspacesController, WorkspaceMembersController],
  providers: [WorkspacesService, WorkspaceMembersService, WorkspaceMemberGuard],
  exports: [WorkspacesService, WorkspaceMembersService, WorkspaceMemberGuard],
})
export class WorkspacesModule {}
