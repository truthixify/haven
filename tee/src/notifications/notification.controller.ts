import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { NotificationService } from './notification.service';

/**
 * Notification Controller
 *
 * REST endpoints for the dashboard to fetch and manage notifications.
 * All routes live under the NestJS global prefix (`/api`), so the
 * full paths are `/api/notifications/...`.
 */
@Controller('notifications')
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(private readonly notificationService: NotificationService) {}

  /**
   * GET /notifications?commitment=<hex>&limit=20&unreadOnly=false
   *
   * Fetch notifications for a given identity commitment.
   */
  @Get()
  async getNotifications(
    @Query('commitment') commitment: string,
    @Query('limit') limitStr?: string,
    @Query('unreadOnly') unreadOnlyStr?: string,
  ) {
    if (!commitment) {
      throw new HttpException(
        'Missing "commitment" query parameter',
        HttpStatus.BAD_REQUEST,
      );
    }

    const limit = limitStr ? parseInt(limitStr, 10) : 20;
    const unreadOnly = unreadOnlyStr === 'true';

    const notifications = await this.notificationService.getNotifications(
      commitment,
      limit,
      unreadOnly,
    );

    return { notifications };
  }

  /**
   * GET /notifications/unread-count?commitment=<hex>
   *
   * Get the number of unread notifications for a user.
   */
  @Get('unread-count')
  async getUnreadCount(@Query('commitment') commitment: string) {
    if (!commitment) {
      throw new HttpException(
        'Missing "commitment" query parameter',
        HttpStatus.BAD_REQUEST,
      );
    }

    const count = await this.notificationService.getUnreadCount(commitment);
    return { count };
  }

  /**
   * POST /notifications/:id/read
   *
   * Mark a single notification as read.
   */
  @Post(':id/read')
  async markAsRead(@Param('id') id: string) {
    const success = await this.notificationService.markAsRead(id);

    if (!success) {
      throw new HttpException('Notification not found', HttpStatus.NOT_FOUND);
    }

    return { success: true };
  }

  /**
   * POST /notifications/read-all?commitment=<hex>
   *
   * Mark all notifications for a user as read.
   */
  @Post('read-all')
  async markAllAsRead(@Query('commitment') commitment: string) {
    if (!commitment) {
      throw new HttpException(
        'Missing "commitment" query parameter',
        HttpStatus.BAD_REQUEST,
      );
    }

    const count = await this.notificationService.markAllAsRead(commitment);
    return { success: true, markedRead: count };
  }
}
