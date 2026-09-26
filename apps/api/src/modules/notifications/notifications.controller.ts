import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { listNotificationsQuerySchema, z, type ListNotificationsQuery } from '@roshd/validation';
import { ZodParam, ZodQuery } from '../../common/http/zod';
import { CurrentUser, type Principal } from '../rbac/principal';
import { NotificationsService } from './notifications.service';

/** The signed-in user's notification center; nobody can read another user's notifications. */
@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('mine')
  @ApiOperation({ summary: 'My notifications, newest first (unread=true filters)' })
  mine(
    @CurrentUser() user: Principal,
    @ZodQuery(listNotificationsQuerySchema) query: ListNotificationsQuery,
  ) {
    return this.notifications.listMine(user.userId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Number of unread notifications (dashboard badge)' })
  unreadCount(@CurrentUser() user: Principal) {
    return this.notifications.unreadCount(user.userId);
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: Principal) {
    return this.notifications.markAllRead(user.userId);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@CurrentUser() user: Principal, @ZodParam('id', z.uuid()) id: string) {
    return this.notifications.markRead(id, user.userId);
  }
}
