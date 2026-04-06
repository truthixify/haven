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
  ) {}

  /**
   * Main scoring cycle cron job.
   * Runs every 5 minutes by default (configurable via SCORING_CRON).
   */
  @Cron(process.env.SCORING_CRON || '*/5 * * * *', {
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
      let succeeded = 0;
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
            } else {
              succeeded++;
            }
          } else {
            failed++;
            this.logger.error(
              `User scoring failed: ${result.reason}`,
            );
          }
        }

        this.logger.log(
          `Batch progress: ${processed}/${totalUsers} (${succeeded} ok, ${failed} failed, ${skipped} skipped)`,
        );
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      this.logger.log(
        `=== Scoring Cycle Epoch ${epoch} Complete ===` +
          ` ${succeeded} succeeded, ${failed} failed, ${skipped} skipped` +
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
  ): Promise<'done' | 'skipped'> {
    const identity = user.identityCommitment;
    const shortId = identity.substring(0, 16);

    // Skip if user was already scored this epoch
    if (user.lastScoredEpoch !== undefined && user.lastScoredEpoch >= epoch) {
      this.logger.debug(`Skipping ${shortId}... (already scored epoch ${epoch})`);
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

    // Get previous score from DB (not chain — chain may not be updated yet)
    const previousScore = (user as any).lastComputedScore ?? 0;

    // Steps 3-5: Attestation, proof, and chain submission — only if proof worker is up
    if (proofWorkerAvailable) {
      try {
        await this.performAttestationAndChainSubmit(
          user,
          scoringResult,
          epoch,
          previousScore,
          programHash,
        );
      } catch (error) {
        this.logger.warn(
          `Attestation/proof/chain steps failed for ${shortId}... (score still recorded): ${error}`,
        );
      }
    } else {
      this.logger.debug(
        `${shortId}... — skipping attestation/proof/chain (proof worker unavailable)`,
      );
    }

    // Step 6: Create notifications for the user (always, even without proof)
    await this.createScoringNotifications(
      identity,
      previousScore,
      scoringResult,
      epoch,
      user,
    );

    // Update DB with last scored epoch and computed score
    await this.databaseService.updateUserRecord(identity, {
      lastScoredEpoch: epoch,
      lastComputedScore: scoringResult.score,
    });

    this.logger.log(
      `${shortId}... scored: ${scoringResult.score} (privacy=${scoringResult.breakdown.privacy}, contribution=${scoringResult.breakdown.contribution}, humanity=${scoringResult.breakdown.humanity}, community=${scoringResult.breakdown.community}) epoch ${epoch}`,
    );

    return 'done';
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
      epoch,
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
      await this.chainService.submitScoreUpdate(
        user.scoreCellOutpoint,
        scoringResult,
        proof,
        programHash ?? Buffer.alloc(32),
      );
    } else {
      this.logger.warn(
        `No score cell outpoint for ${identity.substring(0, 16)}... - skipping chain submission`,
      );
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
