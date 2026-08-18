import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /**
   * All recent notifications for the current user. Default limit 50; the
   * service caps at 100 to bound pathological cases.
   */
  @Get()
  @ApiOperation({ summary: 'List recent notifications for the current user' })
  list(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : undefined;
    return this.notifications.listForUser(user.id, Number.isFinite(parsed) ? parsed : undefined);
  }

  /**
   * Unread count for the header bell badge. Cheap, polled every ~30s by
   * the frontend.
   */
  @Get('unread-count')
  @ApiOperation({ summary: 'Fast unread count for the notification bell badge' })
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.unreadCount(user.id);
  }

  /**
   * Mark one as read. Idempotent — repeating on an already-read row is a
   * no-op, still returns 200.
   */
  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.notifications.markRead(user.id, id);
  }

  /**
   * Bulk mark. Only touches unread rows so repeat calls are cheap.
   */
  @Post('mark-all-read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark every unread notification as read' })
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.markAllRead(user.id);
  }
}
