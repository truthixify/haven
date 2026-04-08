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
import { ApiTags, ApiOperation, ApiOkResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@Controller('notifications')
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Get notifications', description: 'Fetch notifications for a given identity commitment.' })
  @ApiQuery({ name: 'commitment', description: 'Identity commitment (64-char hex)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max notifications to return', example: '20' })
  @ApiQuery({ name: 'unreadOnly', required: false, description: 'Only return unread notifications', example: 'false' })
  @ApiOkResponse({ schema: { type: 'object', properties: { notifications: { type: 'array', items: { type: 'object' } } } } })
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

  @Get('unread-count')
  @ApiOperation({ summary: 'Unread count', description: 'Get the number of unread notifications for a user.' })
  @ApiQuery({ name: 'commitment', description: 'Identity commitment (64-char hex)' })
  @ApiOkResponse({ schema: { type: 'object', properties: { count: { type: 'number' } } } })
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

  @Post(':id/read')
  @ApiOperation({ summary: 'Mark as read', description: 'Mark a single notification as read.' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiOkResponse({ schema: { type: 'object', properties: { success: { type: 'boolean' } } } })
  async markAsRead(@Param('id') id: string) {
    const success = await this.notificationService.markAsRead(id);

    if (!success) {
      throw new HttpException('Notification not found', HttpStatus.NOT_FOUND);
    }

    return { success: true };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Mark all as read', description: 'Mark all notifications for a user as read.' })
  @ApiQuery({ name: 'commitment', description: 'Identity commitment (64-char hex)' })
  @ApiOkResponse({ schema: { type: 'object', properties: { success: { type: 'boolean' }, markedRead: { type: 'number' } } } })
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
