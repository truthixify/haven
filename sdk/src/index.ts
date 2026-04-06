/**
 * @haven-protocol/ckb-sdk
 *
 * Haven Protocol SDK for CKB — the single source of truth for all Haven
 * interactions. Read and verify Haven Scores from the chain, interact with
 * the TEE service, manage deposits, and render tier metadata.
 *
 * ## Quick Start
 *
 * ```ts
 * import { ccc } from '@ckb-ccc/core';
 * import { HavenClient } from '@haven-protocol/ckb-sdk';
 *
 * const client = new ccc.ClientPublicTestnet();
 * const haven = new HavenClient(client);
 *
 * // Fetch a user's score
 * const score = await haven.getScore(userLockHash);
 *
 * // Verify a score threshold
 * const eligible = await haven.verifyThreshold(userLockHash, 650);
 *
 * // Check tier qualification
 * const isGuardian = await haven.verifyTier(userLockHash, 'Guardian');
 *
 * // Get the public leaderboard
 * const top100 = await haven.getLeaderboard(100);
 * ```
 *
 * ## Sub-path Exports
 *
 * - `@haven-protocol/ckb-sdk/react` — React hooks (HavenProvider, useHavenScore, etc.)
 * - `@haven-protocol/ckb-sdk/tee` — TEE client (HavenTeeClient, ConnectionStatus)
 * - `@haven-protocol/ckb-sdk/contracts` — Script builders, cell builders, deploy info
 * - `@haven-protocol/ckb-sdk/attestations` — Off-chain attestation generation
 */

// Core client
export { HavenClient } from './client';

// Types
export type {
  TierName,
  HavenScore,
  ScoreBreakdown,
  LeaderboardEntry,
  LeaderboardOptions,
  ScoreAttestation,
  RegistryConfig,
  RawScoreCellData,
  HavenClientOptions,
} from './types';

// Cell parser
export {
  parseScoreCell,
  serializeScoreCell,
  getTierForScore,
  type SerializeScoreCellInput,
} from './cell-parser';

// Registry
export {
  parseRegistryCell,
  fetchRegistryConfig,
  getDefaultRegistryConfig,
} from './registry';

// Attestation
export { generateAttestation, generateSimpleAttestation } from './attestation';

// Constants
export {
  TIER_THRESHOLDS,
  TIER_ORDER,
  SCORE_CELL_SIZE,
  CELL_OFFSETS,
  BREAKDOWN_OFFSETS,
  REGISTRY_CELL_SIZE,
  REGISTRY_CELL_OFFSETS,
  HAVEN_TYPE_SCRIPT_CODE_HASH,
  HAVEN_TYPE_SCRIPT_HASH_TYPE,
  HAVEN_REGISTRY_CODE_HASH,
  HAVEN_REGISTRY_HASH_TYPE,
  HAVEN_LOCK_SCRIPT_CODE_HASH,
  HAVEN_LOCK_SCRIPT_HASH_TYPE,
  DEFAULT_EPOCH_DURATION,
  DEFAULT_MIN_DEPOSIT,
  DEFAULT_PER_UPDATE_FEE,
  MAX_SCORE,
  MIN_SCORE,
  MAX_COMPONENT_SCORES,
} from './constants';

// TEE client
export { HavenTeeClient } from './tee/client';
export type { ConnectionStatus, TeeClientOptions, TeeHealthStatus } from './tee/types';

// Wallet helpers
export {
  createIdentityMessage,
  getMyScore,
  buildDepositTopUp,
  type BuildDepositTopUpOptions,
} from './wallet';

// Deposit helpers
export {
  estimateUpdatesRemaining,
  isLowBalance,
  formatCkbAmount,
} from './deposits';

// Tier metadata & UI helpers
export {
  type TierDefinition,
  type TierProgress,
  getTierDefinition,
  getAllTierDefinitions,
  getProgressToNextTier,
  formatScore,
  truncateHash,
} from './tiers';
