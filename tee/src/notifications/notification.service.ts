import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { NotificationEntity } from './notification.entity';

/**
 * Notification Service
 *
 * Manages the lifecycle of user notifications: creation, retrieval,
 * read-marking, and convenience helpers for common notification types
 * (score updates, tier changes, low balance, system messages).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notificationRepository: Repository<NotificationEntity>,
  ) {}

  // -----------------------------------------------------------------------
  // Core CRUD
  // -----------------------------------------------------------------------

  /**
   * Create a notification for a user.
   */
  async createNotification(
    identityCommitment: string,
    type: string,
    title: string,
    message: string,
    metadata?: Record<string, unknown>,
  ): Promise<NotificationEntity> {
    const notification = this.notificationRepository.create();
    notification.identityCommitment = identityCommitment;
    notification.type = type;
    notification.title = title;
    notification.message = message;
    notification.metadata = metadata ?? null;

    const saved = await this.notificationRepository.save(notification);

    this.logger.debug(
      `Notification created for ${identityCommitment.substring(0, 16)}...: [${type}] ${title}`,
    );

    return saved;
  }

  /**
   * Fetch notifications for a user, ordered newest-first.
   *
   * @param identityCommitment - User identity
   * @param limit - Max notifications to return (default 50)
   * @param unreadOnly - If true, only return unread notifications
   */
  async getNotifications(
    identityCommitment: string,
    limit = 50,
    unreadOnly = false,
  ): Promise<NotificationEntity[]> {
    const where: FindOptionsWhere<NotificationEntity> = { identityCommitment };
    if (unreadOnly) {
      where.read = false;
    }

    return this.notificationRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(id: string): Promise<boolean> {
    const result = await this.notificationRepository.update(
      { id },
      { read: true },
    );
    return (result.affected ?? 0) > 0;
  }

  /**
   * Mark all notifications for a user as read.
   */
  async markAllAsRead(identityCommitment: string): Promise<number> {
    const result = await this.notificationRepository.update(
      { identityCommitment, read: false },
      { read: true },
    );
    return result.affected ?? 0;
  }

  /**
   * Get the count of unread notifications for a user.
   */
  async getUnreadCount(identityCommitment: string): Promise<number> {
    return this.notificationRepository.count({
      where: { identityCommitment, read: false },
    });
  }

  // -----------------------------------------------------------------------
  // Convenience helpers for common notification types
  // -----------------------------------------------------------------------

  /**
   * Notify a user that their score was updated.
   */
  async notifyScoreUpdate(
    identityCommitment: string,
    oldScore: number,
    newScore: number,
    epoch: number,
  ): Promise<NotificationEntity> {
    const delta = newScore - oldScore;
    const direction = delta >= 0 ? 'up' : 'down';
    const arrow = delta >= 0 ? '+' : '';

    return this.createNotification(
      identityCommitment,
      'score_update',
      `Score updated to ${newScore}`,
      `Your Haven Score changed from ${oldScore} to ${newScore} (${arrow}${delta}) in epoch ${epoch}.`,
      { oldScore, newScore, delta, direction, epoch },
    );
  }

  /**
   * Notify a user that their tier changed.
   */
  async notifyTierChange(
    identityCommitment: string,
    oldTier: string,
    newTier: string,
  ): Promise<NotificationEntity> {
    return this.createNotification(
      identityCommitment,
      'tier_change',
      `You've reached ${newTier} tier`,
      `Congratulations! Your tier changed from ${oldTier} to ${newTier}.`,
      { oldTier, newTier },
    );
  }

  /**
   * Notify a user that their deposit balance is low.
   */
  async notifyLowBalance(
    identityCommitment: string,
    balance: bigint,
  ): Promise<NotificationEntity> {
    // Convert shannons to CKBytes for display (1 CKB = 100_000_000 shannons)
    const ckbBalance = Number(balance) / 100_000_000;

    return this.createNotification(
      identityCommitment,
      'deposit_low',
      'Low deposit balance',
      `Your deposit balance is ${ckbBalance.toFixed(2)} CKB. Top up to keep automatic score updates running.`,
      { balanceShannons: balance.toString(), ckbBalance },
    );
  }

  /**
   * Send a generic system notification to a user.
   */
  async notifySystemMessage(
    identityCommitment: string,
    title: string,
    message: string,
  ): Promise<NotificationEntity> {
    return this.createNotification(
      identityCommitment,
      'system',
      title,
      message,
    );
  }
}
