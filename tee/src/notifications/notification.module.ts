import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationEntity } from './notification.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';

/**
 * Notification Module
 *
 * Provides notification creation, retrieval, and read-marking for
 * the scoring scheduler and dashboard API.
 */
@Module({
  imports: [TypeOrmModule.forFeature([NotificationEntity])],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
