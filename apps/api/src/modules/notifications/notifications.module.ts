import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

/**
 * Notifications module. PrismaService is available via the global
 * PrismaModule so nothing to import here.
 *
 * `NotificationsService` is exported so `CommentsModule` can inject it
 * to emit MENTION notifications at comment-create time.
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
