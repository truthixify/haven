import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './entities/user.entity';
import { ConnectionEntity } from './entities/connection.entity';
import { ConnectionRecord, SealedUserRecord } from '../common/types';

/** Default reputation weights per provider. */
const DEFAULT_REPUTATION_WEIGHTS: Record<string, number> = {
  twitter: 12.5,
  github: 35.0,
  ckb_wallet: 52.5,
  linkedin: 15.0,
  discord: 10.0,
};

/**
 * Database Service - PostgreSQL-backed replacement for SealedStorageService
 *
 * Provides the exact same public interface as the former SealedStorageService
 * so all consumers can swap in without logic changes. Data is stored in a
 * local Postgres instance running inside the Phala TEE container.
 *
 * Also provides generic connection management methods that replace the former
 * hardcoded Twitter/GitHub columns on the users table.
 */
@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(ConnectionEntity)
    private readonly connectionRepository: Repository<ConnectionEntity>,
  ) {}

  // =========================================================================
  // User Record Methods
  // =========================================================================

  /**
   * Store a user record. Inserts a new row or updates an existing one
   * (upsert on the identityCommitment primary key).
   */
  async storeUserRecord(record: SealedUserRecord): Promise<void> {
    try {
      const entity = this.userRepository.create();
      entity.identityCommitment = record.identityCommitment;
      entity.ckbPubKey = record.ckbPubKey;
      entity.lastScoredEpoch = record.lastScoredEpoch ?? null;
      entity.scoreCellOutpoint = record.scoreCellOutpoint ?? null;

      await this.userRepository.save(entity);
      this.logger.debug(
        `Record stored for identity ${record.identityCommitment.substring(0, 16)}...`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to store record for ${record.identityCommitment.substring(0, 16)}...`,
        error,
      );
      throw error;
    }
  }

  /**
   * Retrieve a user record by identity commitment.
   */
  async getUserRecord(
    identityCommitment: string,
  ): Promise<SealedUserRecord | null> {
    try {
      const entity = await this.userRepository.findOneBy({
        identityCommitment,
      });

      if (!entity) {
        return null;
      }

      return this.entityToRecord(entity);
    } catch (error) {
      this.logger.error(
        `Failed to read record for ${identityCommitment.substring(0, 16)}...`,
        error,
      );
      return null;
    }
  }

  /**
   * Update specific fields of an existing user record.
   */
  async updateUserRecord(
    identityCommitment: string,
    updates: Partial<SealedUserRecord>,
  ): Promise<boolean> {
    try {
      const entity = await this.userRepository.findOneBy({
        identityCommitment,
      });

      if (!entity) {
        return false;
      }

      // Apply updates, converting undefined values to null for DB storage.
      const updatePayload: Record<string, unknown> = {};

      if ('ckbPubKey' in updates) {
        updatePayload.ckbPubKey = updates.ckbPubKey;
      }
      if ('lastScoredEpoch' in updates) {
        updatePayload.lastScoredEpoch = updates.lastScoredEpoch ?? null;
      }
      if ('scoreCellOutpoint' in updates) {
        updatePayload.scoreCellOutpoint =
          updates.scoreCellOutpoint ?? null;
      }

      await this.userRepository.update(
        { identityCommitment },
        updatePayload as Partial<UserEntity>,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to update record for ${identityCommitment.substring(0, 16)}...`,
        error,
      );
      return false;
    }
  }

  /**
   * Check if a user record exists.
   */
  async hasUserRecord(identityCommitment: string): Promise<boolean> {
    try {
      const count = await this.userRepository.countBy({ identityCommitment });
      return count > 0;
    } catch (error) {
      this.logger.error(
        `Failed to check record for ${identityCommitment.substring(0, 16)}...`,
        error,
      );
      return false;
    }
  }

  /**
   * Delete a user record.
   */
  async deleteUserRecord(identityCommitment: string): Promise<boolean> {
    try {
      const result = await this.userRepository.delete({ identityCommitment });
      return (result.affected ?? 0) > 0;
    } catch (error) {
      this.logger.error(
        `Failed to delete record for ${identityCommitment.substring(0, 16)}...`,
        error,
      );
      return false;
    }
  }

  /**
   * Get all identity commitments in the database.
   * Used by the scoring scheduler to iterate over all registered users.
   */
  async getAllIdentityCommitments(): Promise<string[]> {
    try {
      const entities = await this.userRepository.find({
        select: ['identityCommitment'],
      });
      return entities.map((e) => e.identityCommitment);
    } catch (error) {
      this.logger.error('Failed to get all identity commitments', error);
      return [];
    }
  }

  /**
   * Get all user records. Used by the scoring scheduler for batch processing.
   */
  async getAllUserRecords(): Promise<SealedUserRecord[]> {
    try {
      const entities = await this.userRepository.find();
      return entities.map((e) => this.entityToRecord(e));
    } catch (error) {
      this.logger.error('Failed to get all user records', error);
      return [];
    }
  }

  /**
   * Returns the total number of user records.
   */
  async getUserCount(): Promise<number> {
    try {
      return await this.userRepository.count();
    } catch (error) {
      this.logger.error('Failed to get user count', error);
      return 0;
    }
  }

  // =========================================================================
  // Connection Methods
  // =========================================================================

  /**
   * Add or update a connection for a user (upsert on identityCommitment + provider).
   */
  async addConnection(
    identityCommitment: string,
    provider: string,
    providerId: string,
    accessToken?: string | null,
    refreshToken?: string | null,
    metadata?: Record<string, unknown> | null,
    reputationWeight?: number,
  ): Promise<void> {
    try {
      const weight =
        reputationWeight ?? DEFAULT_REPUTATION_WEIGHTS[provider] ?? 0;

      // Upsert: find existing or create new connection
      let entity = await this.connectionRepository.findOneBy({
        identityCommitment,
        provider,
      });

      if (!entity) {
        entity = this.connectionRepository.create();
        entity.identityCommitment = identityCommitment;
        entity.provider = provider;
      }

      entity.providerId = providerId;
      entity.accessToken = accessToken ?? null;
      entity.refreshToken = refreshToken ?? null;
      entity.metadata = metadata ?? null;
      entity.reputationWeight = weight;

      await this.connectionRepository.save(entity);

      this.logger.debug(
        `Connection ${provider} upserted for identity ${identityCommitment.substring(0, 16)}...`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to add connection ${provider} for ${identityCommitment.substring(0, 16)}...`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get a specific connection for a user by provider.
   */
  async getConnection(
    identityCommitment: string,
    provider: string,
  ): Promise<ConnectionRecord | null> {
    try {
      const entity = await this.connectionRepository.findOneBy({
        identityCommitment,
        provider,
      });

      if (!entity) {
        return null;
      }

      return this.connectionEntityToRecord(entity);
    } catch (error) {
      this.logger.error(
        `Failed to get connection ${provider} for ${identityCommitment.substring(0, 16)}...`,
        error,
      );
      return null;
    }
  }

  /**
   * Get all connections for a user.
   */
  async getConnections(
    identityCommitment: string,
  ): Promise<ConnectionRecord[]> {
    try {
      const entities = await this.connectionRepository.findBy({
        identityCommitment,
      });
      return entities.map((e) => this.connectionEntityToRecord(e));
    } catch (error) {
      this.logger.error(
        `Failed to get connections for ${identityCommitment.substring(0, 16)}...`,
        error,
      );
      return [];
    }
  }

  /**
   * Remove a connection for a user by provider.
   */
  async removeConnection(
    identityCommitment: string,
    provider: string,
  ): Promise<boolean> {
    try {
      const result = await this.connectionRepository.delete({
        identityCommitment,
        provider,
      });
      return (result.affected ?? 0) > 0;
    } catch (error) {
      this.logger.error(
        `Failed to remove connection ${provider} for ${identityCommitment.substring(0, 16)}...`,
        error,
      );
      return false;
    }
  }

  /**
   * Check if a user has a specific connection.
   */
  async hasConnection(
    identityCommitment: string,
    provider: string,
  ): Promise<boolean> {
    try {
      const count = await this.connectionRepository.countBy({
        identityCommitment,
        provider,
      });
      return count > 0;
    } catch (error) {
      this.logger.error(
        `Failed to check connection ${provider} for ${identityCommitment.substring(0, 16)}...`,
        error,
      );
      return false;
    }
  }

  /**
   * Get the list of connected provider names for a user.
   */
  async getConnectionProviders(
    identityCommitment: string,
  ): Promise<string[]> {
    try {
      const entities = await this.connectionRepository.find({
        where: { identityCommitment },
        select: ['provider'],
      });
      return entities.map((e) => e.provider);
    } catch (error) {
      this.logger.error(
        `Failed to get connection providers for ${identityCommitment.substring(0, 16)}...`,
        error,
      );
      return [];
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Convert a UserEntity to the SealedUserRecord interface used by consumers.
   */
  private entityToRecord(entity: UserEntity): SealedUserRecord {
    const record: SealedUserRecord = {
      identityCommitment: entity.identityCommitment,
      ckbPubKey: entity.ckbPubKey,
    };

    if (entity.lastScoredEpoch != null)
      record.lastScoredEpoch = entity.lastScoredEpoch;
    if (entity.scoreCellOutpoint != null)
      record.scoreCellOutpoint = entity.scoreCellOutpoint;

    return record;
  }

  /**
   * Convert a ConnectionEntity to the ConnectionRecord interface.
   */
  private connectionEntityToRecord(
    entity: ConnectionEntity,
  ): ConnectionRecord {
    return {
      provider: entity.provider,
      providerId: entity.providerId,
      accessToken: entity.accessToken,
      refreshToken: entity.refreshToken,
      metadata: entity.metadata,
      reputationWeight: Number(entity.reputationWeight),
    };
  }
}
