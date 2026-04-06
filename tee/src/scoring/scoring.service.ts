import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../storage/database.service';
import { TwitterCollector } from './collectors/twitter.collector';
import { GitHubCollector } from './collectors/github.collector';
import { OnChainCollector } from './collectors/onchain.collector';
import { computePrivacyHygieneScore } from './formulas/privacy-hygiene';
import { computeContributionScore } from './formulas/contribution';
import { computeHumanityScore } from './formulas/humanity';
import { computeCommunityScore } from './formulas/community';
import {
  CollectedActivity,
  ScoreBreakdown,
  ScoringResult,
  SealedUserRecord,
  ScoreTier,
} from '../common/types';
import { SCORE_MAX, SCORE_MIN, TIER_THRESHOLDS } from '../common/constants';

/**
 * Scoring Service - The core scoring engine.
 *
 * Orchestrates the full scoring pipeline for a single user:
 * 1. Read user's sealed storage record (account linkages)
 * 2. Collect activity from all connected platforms
 * 3. Run each scoring formula over the collected activity
 * 4. Produce weighted total score and breakdown
 *
 * All sensitive data (tokens, account IDs) is accessed only through
 * sealed storage and discarded after scoring completes.
 */
@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly twitterCollector: TwitterCollector,
    private readonly githubCollector: GitHubCollector,
    private readonly onchainCollector: OnChainCollector,
  ) {}

  /**
   * Score a single user by their identity commitment.
   *
   * @param identityCommitment - Blake2b hash of the user's CKB public key
   * @param epoch - Current scoring epoch number
   * @returns Scoring result with total score and breakdown, or null on failure
   */
  async scoreUser(
    identityCommitment: string,
    epoch: number,
  ): Promise<ScoringResult | null> {
    this.logger.log(
      `Scoring user ${identityCommitment.substring(0, 16)}... for epoch ${epoch}`,
    );

    // 1. Retrieve sealed user record
    const record =
      await this.databaseService.getUserRecord(identityCommitment);

    if (!record) {
      this.logger.warn(
        `No sealed record found for ${identityCommitment.substring(0, 16)}...`,
      );
      return null;
    }

    // 2. Collect activity from all connected platforms
    const activity = await this.collectActivity(record);

    // 3. Compute score breakdown
    const breakdown = this.computeBreakdown(activity);

    // 4. Compute total score (sum of all components)
    const score = this.computeTotalScore(breakdown);

    const result: ScoringResult = {
      score,
      breakdown,
      epoch,
      identityCommitment,
    };

    this.logger.log(
      `Score computed: ${score} (privacy=${breakdown.privacy}, contribution=${breakdown.contribution}, humanity=${breakdown.humanity}, community=${breakdown.community}) tier=${ScoringService.getTier(score)}`,
    );

    return result;
  }

  /**
   * Collect activity from all connected platforms.
   * Data stays within the TEE and is discarded after scoring.
   */
  private async collectActivity(
    record: SealedUserRecord,
  ): Promise<CollectedActivity> {
    // Fetch connection tokens from the connections table
    const twitterConnection = await this.databaseService.getConnection(
      record.identityCommitment,
      'twitter',
    );
    const githubConnection = await this.databaseService.getConnection(
      record.identityCommitment,
      'github',
    );

    // Collect in parallel for efficiency
    const [twitter, github, onchain] = await Promise.all([
      // Twitter: only if connected with valid token
      twitterConnection?.providerId && twitterConnection?.accessToken
        ? this.twitterCollector.collect(
            twitterConnection.accessToken,
            twitterConnection.providerId,
          )
        : Promise.resolve(undefined),

      // GitHub: only if connected with valid token
      githubConnection?.accessToken
        ? this.githubCollector.collect(githubConnection.accessToken)
        : Promise.resolve(undefined),

      // On-chain: always collected (wallet is always connected)
      // Pass full lock script if available, otherwise fall back to pubkey
      this.onchainCollector.collect(record.ckbPubKey, {
        codeHash: (record as any).lockCodeHash,
        hashType: (record as any).lockHashType,
        args: (record as any).lockArgs,
      }),
    ]);

    return {
      twitter: twitter ?? undefined,
      github: github ?? undefined,
      onchain,
    };
  }

  /**
   * Compute the score breakdown using all four formulas.
   */
  private computeBreakdown(activity: CollectedActivity): ScoreBreakdown {
    const privacy = computePrivacyHygieneScore(activity.onchain);
    const contribution = computeContributionScore(
      activity.github,
      activity.onchain,
    );
    const humanity = computeHumanityScore(
      activity.twitter,
      activity.github,
      activity.onchain,
    );
    const community = computeCommunityScore(
      activity.twitter,
      activity.github,
      activity.onchain,
    );

    return { privacy, contribution, humanity, community };
  }

  /**
   * Compute total score from breakdown.
   * Each component is already weighted (max 400+300+200+100 = 1000).
   */
  private computeTotalScore(breakdown: ScoreBreakdown): number {
    const total =
      breakdown.privacy +
      breakdown.contribution +
      breakdown.humanity +
      breakdown.community;

    return Math.min(Math.max(Math.round(total), SCORE_MIN), SCORE_MAX);
  }

  /**
   * Determine the tier for a given score.
   */
  static getTier(score: number): ScoreTier {
    if (score >= TIER_THRESHOLDS.SOVEREIGN) return ScoreTier.Sovereign;
    if (score >= TIER_THRESHOLDS.GUARDIAN) return ScoreTier.Guardian;
    if (score >= TIER_THRESHOLDS.TRUSTED) return ScoreTier.Trusted;
    if (score >= TIER_THRESHOLDS.INITIATE) return ScoreTier.Initiate;
    return ScoreTier.Observer;
  }
}
