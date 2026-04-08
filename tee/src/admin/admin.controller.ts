import {
  Controller,
  Delete,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../storage/entities/user.entity';
import { ConnectionEntity } from '../storage/entities/connection.entity';
import { NotificationEntity } from '../notifications/notification.entity';
import { ScoreHistoryEntity } from '../storage/entities/score-history.entity';

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(ConnectionEntity)
    private readonly connectionRepo: Repository<ConnectionEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notificationRepo: Repository<NotificationEntity>,
    @InjectRepository(ScoreHistoryEntity)
    private readonly scoreHistoryRepo: Repository<ScoreHistoryEntity>,
  ) {}

  @Delete('clear-db')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clear all database data',
    description:
      'Deletes all users, connections, and notifications. ' +
      'For testing only — will be removed before production.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        deleted: {
          type: 'object',
          properties: {
            notifications: { type: 'number' },
            connections: { type: 'number' },
            users: { type: 'number' },
          },
        },
      },
    },
  })
  async clearDatabase(): Promise<{
    success: boolean;
    deleted: { notifications: number; connections: number; users: number };
  }> {
    this.logger.warn('Clearing all database data');

    // Count before clearing
    const notifCount = await this.notificationRepo.count();
    const connCount = await this.connectionRepo.count();
    const userCount = await this.userRepo.count();

    // Clear in order: score_history, notifications, connections, users (FK-safe)
    await this.scoreHistoryRepo.clear();
    await this.notificationRepo.clear();
    await this.connectionRepo.clear();
    await this.userRepo.clear();

    const deleted = {
      notifications: notifCount,
      connections: connCount,
      users: userCount,
    };

    this.logger.warn(
      `Database cleared: ${deleted.users} users, ${deleted.connections} connections, ${deleted.notifications} notifications`,
    );

    return { success: true, deleted };
  }
}
