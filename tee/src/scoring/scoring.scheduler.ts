import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { ScoringService } from './scoring.service';
import { DatabaseService } from '../storage/database.service';
import { AttestationService } from '../attestation/attestation.service';
import { ProofWorkerClient } from '../attestation/proof-worker.client';
import { ChainService } from '../chain/chain.service';
import { RegistryService } from '../chain/registry.service';
import { NotificationService } from '../notifications/notification.service';
import { ScoreHistoryService } from '../storage/score-history.service';
import { ScoringResult, SealedUserRecord, SP1PublicInputs } from '../common/types';
import { LOW_BALANCE_THRESHOLD } from '../common/constants';

/**
 * Scoring Scheduler
 *
 * Runs the scoring cycle for all registered users every 5 minutes.
 * For each user:
 *   1. Collect activity (via ScoringService)
 *   2. Compute score (via ScoringService)
 *   3. Generate DCAP attestation (via AttestationService) — if available
 *   4. Request SP1 proof (via ProofWorkerClient) — if available
 *   5. Build and submit CKB transaction (via ChainService) — if proof available
 *
 * Steps 3-5 are skipped gracefully when the proof worker or chain
 * submission infrastructure isn't ready (e.g., on testnet without SP1).
 * The score is still computed and stored, and a notification is created.
 *
 * The scheduler processes users in batches to avoid overwhelming
 * external APIs. Failed users are logged and retried next cycle.
 */
@Injectable()
export class ScoringScheduler {
  private readonly logger = new Logger(ScoringScheduler.name);

  /** Number of users to process concurrently */
  private readonly batchSize = 10;

  /** Current global epoch (incremented each cycle, initialized from DB) */
  private currentEpoch = 0;
  private epochInitialized = false;

  /** Whether a scoring cycle is currently running */
  private isRunning = false;

  constructor(
    private readonly config: ConfigService,
    private readonly scoringService: ScoringService,
    private readonly databaseService: DatabaseService,
    private readonly attestationService: AttestationService,
    private readonly proofWorkerClient: ProofWorkerClient,
    private readonly chainService: ChainService,
    private readonly registryService: RegistryService,
    private readonly notificationService: NotificationService,
    private readonly scoreHistoryService: ScoreHistoryService,
  ) {}

  /**
   * Main scoring cycle cron job.
   * Runs every 24 hours by default (configurable via SCORING_CRON).
   */
  @Cron(process.env.SCORING_CRON || '0 0 * * *', {
    name: 'haven-scoring-cycle',
    timeZone: 'UTC',
  })
  async runScoringCycle(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        'Scoring cycle already running - skipping this trigger',
      );
      return;
    }

    this.isRunning = true;

    // On first run after TEE restart, initialize epoch from DB
    if (!this.epochInitialized) {
      try {
        const allUsers = await this.databaseService.getAllUserRecords();
        const maxEpoch = Math.max(0, ...allUsers.map(u => (u as any).lastScoredEpoch ?? 0));
        this.currentEpoch = maxEpoch;
        this.logger.log(`Epoch initialized from DB: ${this.currentEpoch}`);
      } catch {
        this.logger.warn('Could not read epoch from DB, starting from 0');
      }
      this.epochInitialized = true;
    }

    this.currentEpoch++;
    const epoch = this.currentEpoch;

    this.logger.log(`=== Scoring Cycle Epoch ${epoch} Started ===`);
    const startTime = Date.now();

    try {
      // Check if proof worker is available (non-blocking)
      const proofWorkerAvailable =
        await this.proofWorkerClient.isHealthy();

      if (!proofWorkerAvailable) {
        this.logger.warn(
          'Proof worker is not available — scoring will proceed without attestation/proof/chain submission',
        );
      }

      // Get current registry data (program hash, fee amounts, etc.)
      let registry: any = null;
      try {
        registry = await this.registryService.getRegistryData();
      } catch (error) {
        this.logger.warn(
          `Failed to fetch registry data — proceeding without it: ${error}`,
        );
      }

      // Get all registered users from sealed storage
      const allUsers = await this.databaseService.getAllUserRecords();
      const totalUsers = allUsers.length;

      this.logger.log(
        `Processing ${totalUsers} users in batches of ${this.batchSize}`,
      );

      let processed = 0;
      let confirmed = 0;  // Score submitted AND confirmed on-chain
      let partial = 0;     // Score computed but NOT on-chain
      let failed = 0;
      let skipped = 0;

      // Process users in batches
      for (let i = 0; i < allUsers.length; i += this.batchSize) {
        const batch = allUsers.slice(i, i + this.batchSize);

        const results = await Promise.allSettled(
          batch.map((user) =>
            this.processUser(
              user,
              epoch,
              proofWorkerAvailable,
              registry?.currentProgramHash,
            ),
          ),
        );

        for (const result of results) {
          processed++;

          if (result.status === 'fulfilled') {
            if (result.value === 'skipped') {
              skipped++;
            } else if (result.value === 'done') {
              confirmed++;
            } else {
              partial++;
            }
          } else {
            failed++;
            this.logger.error(
              `User scoring failed: ${result.reason}`,
            );
          }
        }

        this.logger.log(
          `Batch progress: ${processed}/${totalUsers} (${confirmed} confirmed, ${partial} scored-only, ${failed} failed, ${skipped} skipped)`,
        );
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(
        `=== Scoring Cycle Epoch ${epoch} Complete ===` +
          ` ${confirmed} confirmed on-chain, ${partial} scored-only, ${failed} failed, ${skipped} skipped` +
          ` in ${duration}s`,
      );
    } catch (error) {
      this.logger.error(`Scoring cycle epoch ${epoch} failed:`, error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process a single user through the scoring pipeline.
   *
   * Steps 1-2 (collect activity + compute score) always run.
   * Steps 3-5 (attestation + proof + chain submit) are attempted only
   * when the proof worker is available, and failures are non-fatal.
   *
   * @returns 'skipped' if the user was skipped, 'done' if successful
   * @throws Error if scoring (steps 1-2) fails
   */
  private async processUser(
    user: SealedUserRecord,
    epoch: number,
    proofWorkerAvailable: boolean,
    programHash?: Buffer,
  ): Promise<'done' | 'partial' | 'skipped'> {
    const identity = user.identityCommitment;
    const shortId = identity.substring(0, 16);

    // Skip if user was already scored AND confirmed this epoch
    if (user.lastScoredEpoch !== undefined && user.lastScoredEpoch >= epoch) {
      return 'skipped';
    }

    // Skip if user has no score cell outpoint — nothing to update on-chain
    if (!user.scoreCellOutpoint) {
      this.logger.debug(`Skipping ${shortId}... (no score cell outpoint)`);
      return 'skipped';
    }

    this.logger.debug(`Processing ${shortId}...`);

    // Step 1 & 2: Collect activity and compute score
    const scoringResult = await this.scoringService.scoreUser(
      identity,
      epoch,
    );

    if (!scoringResult) {
      throw new Error(`Scoring returned null for ${shortId}...`);
    }

    // Get previous score from on-chain cell (ground truth)
    const { score: onChainScore, epoch: onChainEpoch } =
      await this.getPreviousScoreAndEpoch(user);
    const previousScore = onChainScore;

    // Always keep DB in sync with what we computed
    await this.databaseService.updateUserRecord(identity, {
      lastComputedScore: scoringResult.score,
    });

    // Skip proof generation and chain submission if score hasn't changed
    if (scoringResult.score === previousScore && previousScore > 0) {
      this.logger.log(
        `${shortId}... score unchanged (${scoringResult.score}), skipping proof/chain`,
      );
      return 'skipped';
    }

    // Steps 3-5: Attestation, proof, and chain submission
    let chainSubmitted = false;

    if (proofWorkerAvailable) {
      try {
        await this.performAttestationAndChainSubmit(
          user,
          scoringResult,
          epoch,
          previousScore,
          programHash,
        );
        chainSubmitted = true;
        this.logger.log(`${shortId}... score update submitted on-chain`);
      } catch (error) {
        this.logger.error(
          `${shortId}... attestation/proof/chain FAILED: ${error}`,
        );
      }
    } else {
      this.logger.warn(
        `${shortId}... — proof worker unavailable, skipping attestation/proof/chain`,
      );
    }

    // Only create notifications and update DB if chain submission succeeded
    if (chainSubmitted) {
      await this.createScoringNotifications(
        identity,
        previousScore,
        scoringResult,
        epoch,
        user,
      );

      await this.databaseService.updateUserRecord(identity, {
        lastScoredEpoch: epoch,
        lastComputedScore: scoringResult.score,
      });

      // Record score history for the chart
      const updatedOutpoint = await this.databaseService.getUserRecord(identity);
      await this.scoreHistoryService.record(
        identity,
        onChainEpoch + 1,
        scoringResult.score,
        scoringResult.breakdown,
        updatedOutpoint?.scoreCellOutpoint?.txHash ?? null,
      );
    }

    const status = chainSubmitted ? 'confirmed' : 'scored_only';
    this.logger.log(
      `${shortId}... [${status}] score=${scoringResult.score} (privacy=${scoringResult.breakdown.privacy}, contribution=${scoringResult.breakdown.contribution}, humanity=${scoringResult.breakdown.humanity}, community=${scoringResult.breakdown.community}) epoch ${epoch}`,
    );

    return chainSubmitted ? 'done' : 'partial';
  }

  /**
   * Perform the attestation, proof generation, and chain submission steps.
   * Separated so failures here don't prevent score recording.
   */
  private async performAttestationAndChainSubmit(
    user: SealedUserRecord,
    scoringResult: ScoringResult,
    epoch: number,
    previousScore: number,
    programHash?: Buffer,
  ): Promise<void> {
    const identity = user.identityCommitment;

    // Step 3: Generate DCAP attestation over the scoring output
    const programHashHex = programHash
      ? programHash.toString('hex')
      : '0'.repeat(64);

    const attestation = await this.attestationService.generateAttestation(
      programHashHex,
      identity,
      scoringResult.score,
      epoch,
      scoringResult.breakdown,
    );

    // Step 4: Request SP1 proof from proof worker
    const { epoch: prevEpoch } =
      await this.getPreviousScoreAndEpoch(user);

    const publicInputs: SP1PublicInputs = {
      programHash: programHashHex,
      identityCommitment: identity,
      previousScore,
      newScore: scoringResult.score,
      epoch: prevEpoch + 1, // Type script requires epoch = input_epoch + 1
      privacyScore: scoringResult.breakdown.privacy,
      contributionScore: scoringResult.breakdown.contribution,
      humanityScore: scoringResult.breakdown.humanity,
      communityScore: scoringResult.breakdown.community,
      prevEpoch,
    };

    const proof = await this.proofWorkerClient.requestProof(
      attestation,
      publicInputs,
    );

    // Step 5: Build and submit CKB transaction
    if (user.scoreCellOutpoint) {
      const txHash = await this.chainService.submitScoreUpdate(
        user.scoreCellOutpoint,
        scoringResult,
        proof,
        programHash ?? Buffer.alloc(32),
      );
      if (!txHash) {
        throw new Error('Chain submission returned null — transaction failed');
      }

      // Update the stored outpoint to the new cell location
      await this.databaseService.updateUserRecord(identity, {
        scoreCellOutpoint: { txHash, index: 0 },
      });
    } else {
      throw new Error('No score cell outpoint — cannot submit to chain');
    }
  }

  /**
   * Get the previous score and epoch for a user.
   * Reads from the existing score cell on CKB if available.
   */
  private async getPreviousScoreAndEpoch(
    user: SealedUserRecord,
  ): Promise<{ score: number; epoch: number }> {
    if (!user.scoreCellOutpoint) {
      return { score: 0, epoch: 0 };
    }

    try {
      const cellData = await this.chainService.readScoreCell(
        user.scoreCellOutpoint,
      );
      return {
        score: cellData?.score ?? 0,
        epoch: cellData?.epoch ?? 0,
      };
    } catch {
      return { score: 0, epoch: 0 };
    }
  }

  /**
   * Create notifications after a successful score update.
   *
   * Always creates a "score updated" notification. Additionally creates
   * tier-change and low-balance notifications when applicable.
   */
  private async createScoringNotifications(
    identityCommitment: string,
    previousScore: number,
    scoringResult: ScoringResult,
    epoch: number,
    user: SealedUserRecord,
  ): Promise<void> {
    try {
      // Only notify if score actually changed
      if (scoringResult.score !== previousScore) {
        await this.notificationService.notifyScoreUpdate(
          identityCommitment,
          previousScore,
          scoringResult.score,
          epoch,
        );
      }

      // If tier changed: tier change notification
      const oldTier = ScoringService.getTier(previousScore);
      const newTier = ScoringService.getTier(scoringResult.score);

      if (oldTier !== newTier) {
        await this.notificationService.notifyTierChange(
          identityCommitment,
          oldTier,
          newTier,
        );
      }

      // If deposit balance is low: low balance notification
      if (user.scoreCellOutpoint) {
        try {
          const cellData = await this.chainService.readScoreCell(
            user.scoreCellOutpoint,
          );

          if (
            cellData?.depositBalance !== undefined &&
            cellData.depositBalance < LOW_BALANCE_THRESHOLD
          ) {
            await this.notificationService.notifyLowBalance(
              identityCommitment,
              cellData.depositBalance,
            );
          }
        } catch {
          // Non-critical — skip low-balance check on read failure
        }
      }
    } catch (error) {
      // Notification failures must not break the scoring pipeline
      this.logger.warn(
        `Failed to create notifications for ${identityCommitment.substring(0, 16)}...: ${error}`,
      );
    }
  }

  /**
   * Get the current epoch number.
   */
  getCurrentEpoch(): number {
    return this.currentEpoch;
  }

  /**
   * Check if a scoring cycle is currently running.
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Manually trigger a scoring cycle for a single user (admin/debug).
   */
  async scoreSingleUser(identityCommitment: string): Promise<ScoringResult | null> {
    return this.scoringService.scoreUser(
      identityCommitment,
      this.currentEpoch,
    );
  }
}
