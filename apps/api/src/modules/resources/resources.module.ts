import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { CloudinaryService } from './cloudinary.service';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';

@Module({
  imports: [WorkspacesModule, ActivityModule],
  controllers: [ResourcesController],
  providers: [ResourcesService, CloudinaryService],
  exports: [ResourcesService, CloudinaryService],
})
export class ResourcesModule {}
