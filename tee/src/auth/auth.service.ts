import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../storage/database.service';

/**
 * Auth Service
 *
 * Handles linking OAuth accounts (Twitter, GitHub, and future providers)
 * to a user's identity commitment. All tokens are stored exclusively in
 * the connections table and never logged or persisted elsewhere.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Link a Twitter account to an existing identity.
   * The OAuth tokens are sealed immediately via the connections table.
   */
  async linkTwitter(
    identityCommitment: string,
    twitterId: string,
    accessToken: string,
    refreshToken?: string,
  ): Promise<boolean> {
    this.logger.log(
      `Linking Twitter account to identity ${identityCommitment.substring(0, 16)}...`,
    );

    const exists = await this.databaseService.hasUserRecord(identityCommitment);
    if (!exists) {
      this.logger.error(
        `Failed to link Twitter: identity ${identityCommitment.substring(0, 16)}... not found`,
      );
      return false;
    }

    try {
      await this.databaseService.addConnection(
        identityCommitment,
        'twitter',
        twitterId,
        accessToken,
        refreshToken ?? null,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to link Twitter for ${identityCommitment.substring(0, 16)}...`,
        error,
      );
      return false;
    }
  }

  /**
   * Link a GitHub account to an existing identity.
   * The OAuth token is sealed immediately via the connections table.
   */
  async linkGitHub(
    identityCommitment: string,
    githubId: string,
    accessToken: string,
  ): Promise<boolean> {
    this.logger.log(
      `Linking GitHub account to identity ${identityCommitment.substring(0, 16)}...`,
    );

    const exists = await this.databaseService.hasUserRecord(identityCommitment);
    if (!exists) {
      this.logger.error(
        `Failed to link GitHub: identity ${identityCommitment.substring(0, 16)}... not found`,
      );
      return false;
    }

    try {
      await this.databaseService.addConnection(
        identityCommitment,
        'github',
        githubId,
        accessToken,
        null,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to link GitHub for ${identityCommitment.substring(0, 16)}...`,
        error,
      );
      return false;
    }
  }

  /**
   * Check which accounts are linked for a given identity.
   * Returns booleans only - never exposes actual account IDs.
   */
  async getLinkedAccounts(
    identityCommitment: string,
  ): Promise<{ twitter: boolean; github: boolean; discord: boolean; linkedin: boolean; wallet: boolean }> {
    const record =
      await this.databaseService.getUserRecord(identityCommitment);

    if (!record) {
      return { twitter: false, github: false, discord: false, linkedin: false, wallet: false };
    }

    const providers =
      await this.databaseService.getConnectionProviders(identityCommitment);

    return {
      twitter: providers.includes('twitter'),
      github: providers.includes('github'),
      discord: providers.includes('discord'),
      linkedin: providers.includes('linkedin'),
      wallet: !!record.ckbPubKey,
    };
  }

  /**
   * Generic method to link any provider connection.
   */
  async linkConnection(
    identityCommitment: string,
    provider: string,
    providerId: string,
    accessToken: string | null,
    refreshToken: string | null,
    metadata?: Record<string, unknown> | null,
  ): Promise<boolean> {
    const record = await this.databaseService.getUserRecord(identityCommitment);
    if (!record) return false;

    try {
      await this.databaseService.addConnection(
        identityCommitment,
        provider,
        providerId,
        accessToken,
        refreshToken,
        metadata,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to link ${provider} for ${identityCommitment.substring(0, 16)}...`,
        error,
      );
      return false;
    }
  }

  /**
   * Unlink a Twitter account from the identity.
   */
  async unlinkTwitter(identityCommitment: string): Promise<boolean> {
    this.logger.log(
      `Unlinking Twitter from identity ${identityCommitment.substring(0, 16)}...`,
    );

    return this.databaseService.removeConnection(identityCommitment, 'twitter');
  }

  /**
   * Unlink a GitHub account from the identity.
   */
  async unlinkGitHub(identityCommitment: string): Promise<boolean> {
    this.logger.log(
      `Unlinking GitHub from identity ${identityCommitment.substring(0, 16)}...`,
    );

    return this.databaseService.removeConnection(identityCommitment, 'github');
  }
}
