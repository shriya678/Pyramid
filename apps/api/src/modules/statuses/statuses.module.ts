import { Module } from '@nestjs/common';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { StatusesController } from './statuses.controller';
import { StatusesService } from './statuses.service';

/**
 * Statuses module. Depends on WorkspacesModule so the WorkspaceMemberGuard
 * provider is in the DI scope of the controller's @UseGuards(...) decorator.
 */
@Module({
  imports: [WorkspacesModule],
  controllers: [StatusesController],
  providers: [StatusesService],
  exports: [StatusesService],
})
export class StatusesModule {}
