import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { UserEntity } from '../storage/entities/user.entity';
import { ConnectionEntity } from '../storage/entities/connection.entity';
import { NotificationEntity } from '../notifications/notification.entity';
import { ScoreHistoryEntity } from '../storage/entities/score-history.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, ConnectionEntity, NotificationEntity, ScoreHistoryEntity]),
  ],
  controllers: [AdminController],
})
export class AdminModule {}
