/**
 * HavenClient — the core SDK class for reading and verifying Haven Scores
 * on CKB.
 *
 * Wraps a CCC client and provides the full Haven API described in spec
 * section 11.1. All reads are pure on-chain — no Haven API, no Haven server.
 *
 * Usage:
 * ```ts
 * import { ccc } from '@ckb-ccc/core';
 * import { HavenClient } from '@haven-protocol/ckb-sdk';
 *
 * const client = new ccc.ClientPublicTestnet();
 * const haven = new HavenClient(client);
 *
 * const score = await haven.getScore(userLockHash);
 * const eligible = await haven.verifyThreshold(userLockHash, 650);
 * ```
 */

import { ccc } from '@ckb-ccc/core';
import type {
  HavenScore,
  HavenClientOptions,
  LeaderboardEntry,
  LeaderboardOptions,
  RegistryConfig,
  ScoreAttestation,
  TierName,
} from './types';
import { parseScoreCell, getTierForScore } from './cell-parser';
import { fetchRegistryConfig, getDefaultRegistryConfig } from './registry';
import { generateAttestation } from './attestation';
import {
  HAVEN_TYPE_SCRIPT_CODE_HASH,
  HAVEN_TYPE_SCRIPT_HASH_TYPE,
  SCORE_CELL_SIZE,
  TIER_THRESHOLDS,
  TIER_ORDER,
} from './constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// HavenClient
// ---------------------------------------------------------------------------

export class HavenClient {
  private readonly cccClient: ccc.Client;
  private readonly typeScriptCodeHash: string;
  private readonly typeScriptHashType: 'type' | 'data' | 'data1' | 'data2';
  private readonly registryCodeHash: string | undefined;
  private readonly registryHashType: 'type' | 'data' | 'data1' | 'data2' | undefined;

  /**
   * Create a new HavenClient.
   *
   * @param client  - A CCC client instance (e.g. `new ccc.ClientPublicTestnet()`).
   * @param options - Optional overrides for script code hashes (useful for
   *                  testnet or custom deployments).
   */
  constructor(client: ccc.Client, options?: HavenClientOptions) {
    this.cccClient = client;
    this.typeScriptCodeHash = options?.typeScriptCodeHash ?? HAVEN_TYPE_SCRIPT_CODE_HASH;
    this.typeScriptHashType = options?.typeScriptHashType ?? HAVEN_TYPE_SCRIPT_HASH_TYPE;
    this.registryCodeHash = options?.registryCodeHash;
    this.registryHashType = options?.registryHashType;
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Build the Haven Score type script used to identify score cells on-chain.
   * The type script args field contains the lock hash of the score owner.
   */
  private buildScoreTypeScript(lockHash?: string): ccc.Script {
    return ccc.Script.from({
      codeHash: this.typeScriptCodeHash,
      hashType: this.typeScriptHashType,
      args: lockHash ?? '0x',
    });
  }

  /**
   * Get the current tip block number from the CKB node.
   */
  private async getTipBlockNumber(): Promise<number> {
    const tip = await this.cccClient.getTip();
    return Number(tip);
  }

  /**
   * Collect all live cells matching the Haven Score type script.
   * Optionally filter by a specific lock hash in the type script args.
   * Uses prefix search mode so that searching with empty args finds all score cells.
   */
  private async collectScoreCells(lockHash?: string): Promise<HavenScore[]> {
    const typeScript = this.buildScoreTypeScript(lockHash);
    const currentBlock = await this.getTipBlockNumber();
    const scores: HavenScore[] = [];

    const collector = this.cccClient.findCells(
      {
        script: typeScript,
        scriptType: 'type',
        scriptSearchMode: 'prefix',
        withData: true,
      },
    );

    for await (const cell of collector) {
      const outputData = cell.outputData;
      if (!outputData) continue;

      const dataHex = typeof outputData === 'string' ? outputData : ccc.hexFrom(outputData);
      const bytes = hexToBytes(dataHex);

      if (bytes.length !== SCORE_CELL_SIZE) continue;

      try {
        const score = parseScoreCell(bytes, currentBlock);
        scores.push(score);
      } catch {
        // Skip malformed cells
      }
    }

    return scores;
  }

  // -----------------------------------------------------------------------
  // Core API (spec section 11.1)
  // -----------------------------------------------------------------------

  /**
   * Fetch a user's Haven Score by their lock script hash.
   *
   * Queries CKB for the score cell whose type script args match the given
   * lock hash, parses the 127-byte cell data, and returns the full
   * HavenScore object.
   *
   * @param lockHash - Hex-encoded lock script hash (with 0x prefix).
   * @returns The parsed HavenScore, or `null` if no score cell exists.
   */
  async getScore(lockHash: string): Promise<HavenScore | null> {
    const scores = await this.collectScoreCells(lockHash);
    if (scores.length === 0) return null;

    // If multiple cells match (should not happen per spec — one cell per user),
    // return the one with the highest epoch.
    return scores.reduce((best, s) => (s.epoch > best.epoch ? s : best));
  }

  /**
   * Check whether a user's score meets or exceeds a minimum threshold
   * and is not expired.
   *
   * @param lockHash - User's lock script hash.
   * @param minScore - Minimum score required (0-1000).
   * @returns `true` if the score exists, is not expired, and >= minScore.
   */
  async verifyThreshold(lockHash: string, minScore: number): Promise<boolean> {
    const score = await this.getScore(lockHash);
    if (!score) return false;
    return score.isValid && score.score >= minScore;
  }

  /**
   * Check whether a user's score qualifies for a given tier and is not expired.
   *
   * @param lockHash - User's lock script hash.
   * @param tier     - Required tier name.
   * @returns `true` if the score exists, is not expired, and >= the tier threshold.
   */
  async verifyTier(lockHash: string, tier: TierName): Promise<boolean> {
    const threshold = TIER_THRESHOLDS[tier];
    return this.verifyThreshold(lockHash, threshold);
  }

  /**
   * Generate an off-chain attestation that a user meets a score threshold.
   *
   * The attestation includes a signed statement of whether the threshold is
   * met, the user's current tier, and a validity window. Useful for event
   * ticketing, API gating, or private channel access.
   *
   * @param lockHash - User's lock script hash.
   * @param minScore - Minimum score threshold for the attestation.
   * @returns A ScoreAttestation object.
   * @throws If no score cell is found for the given lock hash.
   */
  async generateScoreAttestation(
    lockHash: string,
    minScore: number,
  ): Promise<ScoreAttestation> {
    const score = await this.getScore(lockHash);
    if (!score) {
      throw new Error(`No Haven Score cell found for lock hash: ${lockHash}`);
    }

    const currentBlock = await this.getTipBlockNumber();
    return generateAttestation(score, lockHash, minScore, currentBlock);
  }

  /**
   * Fetch the public leaderboard — all Haven Score cells sorted by score
   * descending. No real identities are exposed; only identity commitments.
   *
   * @param limitOrOptions - Maximum number of entries, or a LeaderboardOptions object.
   * @returns Array of LeaderboardEntry sorted according to options.
   */
  async getLeaderboard(limitOrOptions?: number | LeaderboardOptions): Promise<LeaderboardEntry[]> {
    // Normalize options
    const options: LeaderboardOptions =
      typeof limitOrOptions === 'number'
        ? { limit: limitOrOptions }
        : limitOrOptions ?? {};

    const limit = options.limit ?? 100;
    const sortBy = options.sortBy ?? 'score';
    const sortDirection = options.sortDirection ?? 'desc';

    const allScores = await this.collectScoreCells();

    // Build sort comparator
    const getSortValue = (s: HavenScore): number => {
      switch (sortBy) {
        case 'privacy':
          return s.breakdown.privacy;
        case 'contribution':
          return s.breakdown.contribution;
        case 'humanity':
          return s.breakdown.humanity;
        case 'community':
          return s.breakdown.community;
        case 'score':
        default:
          return s.score;
      }
    };

    const direction = sortDirection === 'asc' ? 1 : -1;

    allScores.sort((a, b) => {
      const diff = getSortValue(a) - getSortValue(b);
      if (diff !== 0) return diff * direction;
      // Secondary sort: epoch descending (most recent first)
      return b.epoch - a.epoch;
    });

    return allScores.slice(0, limit).map((s) => ({
      identityCommitment: s.userIdentity,
      score: s.score,
      tier: s.tier,
      breakdown: s.breakdown,
      epoch: s.epoch,
    }));
  }

  /**
   * Fetch the current user's Haven Score using a CCC signer.
   *
   * Resolves the signer's lock script hash automatically and looks up
   * the score cell on-chain.
   *
   * @param signer - A CCC signer instance.
   * @returns The parsed HavenScore, or `null` if no score cell exists.
   */
  async getMyScore(signer: ccc.Signer): Promise<HavenScore | null> {
    const addressObj = await signer.getRecommendedAddressObj();
    const lockHash = addressObj.script.hash();
    return this.getScore(lockHash);
  }

  // -----------------------------------------------------------------------
  // Additional utilities
  // -----------------------------------------------------------------------

  /**
   * Fetch a score by identity commitment (Blake2b hash of CKB public key)
   * rather than lock hash.
   *
   * This performs a full scan of all score cells and filters by the
   * userIdentity field in the cell data.
   *
   * @param identityCommitment - Hex-encoded identity commitment (32 bytes).
   * @returns The matching HavenScore, or `null` if not found.
   */
  async getScoreByIdentity(identityCommitment: string): Promise<HavenScore | null> {
    const normalized = identityCommitment.startsWith('0x')
      ? identityCommitment.toLowerCase()
      : ('0x' + identityCommitment).toLowerCase();

    const allScores = await this.collectScoreCells();

    for (const score of allScores) {
      if (score.userIdentity.toLowerCase() === normalized) {
        return score;
      }
    }

    return null;
  }

  /**
   * Fetch all live Haven Score cells on-chain.
   *
   * @returns Array of all parsed HavenScore objects.
   */
  async getAllScoreCells(): Promise<HavenScore[]> {
    return this.collectScoreCells();
  }

  /**
   * Fetch the Haven Registry cell configuration from CKB.
   *
   * The Registry cell stores the current program hash, tier thresholds,
   * fee parameters, and other protocol configuration.
   *
   * @returns Parsed RegistryConfig, or a default config if the registry
   *          cell is not found on-chain.
   */
  async getRegistryConfig(): Promise<RegistryConfig> {
    const config = await fetchRegistryConfig(
      this.cccClient,
      this.registryCodeHash,
      this.registryHashType,
    );
    return config ?? getDefaultRegistryConfig();
  }

  /**
   * Check whether a parsed score has expired relative to a given block number.
   *
   * @param score        - A previously parsed HavenScore.
   * @param currentBlock - The block number to check against.
   * @returns `true` if the score's expiresAt is <= currentBlock.
   */
  isScoreExpired(score: HavenScore, currentBlock: number): boolean {
    return currentBlock >= score.expiresAt;
  }

  /**
   * Determine the tier name for a given numeric score.
   *
   * @param score - Numeric score (0-1000).
   * @returns The tier name.
   */
  getTierForScore(score: number): TierName {
    return getTierForScore(score);
  }

  /**
   * Get the underlying CCC client instance.
   * Useful when dApps need direct CKB access alongside Haven reads.
   */
  getCccClient(): ccc.Client {
    return this.cccClient;
  }
}
