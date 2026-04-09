/**
 * Haven Protocol - Constants
 *
 * All constants match the protocol specification in haven_protocol_ckb.md.
 */

// ---------------------------------------------------------------------------
// Score Cell Data Layout (127 bytes total)
// ---------------------------------------------------------------------------

export const SCORE_CELL_VERSION = 1;
export const SCORE_CELL_TOTAL_BYTES = 127;

/** Byte offsets for each field in the score cell data */
export const CELL_LAYOUT = {
  VERSION_OFFSET: 0,
  VERSION_SIZE: 1,

  SCORE_OFFSET: 1,
  SCORE_SIZE: 2,

  EPOCH_OFFSET: 3,
  EPOCH_SIZE: 4,

  USER_IDENTITY_OFFSET: 7,
  USER_IDENTITY_SIZE: 32,

  PROGRAM_HASH_OFFSET: 39,
  PROGRAM_HASH_SIZE: 32,

  PROOF_HASH_OFFSET: 71,
  PROOF_HASH_SIZE: 32,

  SCORE_BREAKDOWN_OFFSET: 103,
  SCORE_BREAKDOWN_SIZE: 8,

  ISSUED_AT_OFFSET: 111,
  ISSUED_AT_SIZE: 4,

  EXPIRES_AT_OFFSET: 115,
  EXPIRES_AT_SIZE: 4,

  DEPOSIT_BALANCE_OFFSET: 119,
  DEPOSIT_BALANCE_SIZE: 8,
} as const;

// ---------------------------------------------------------------------------
// Score Ranges & Tiers
// ---------------------------------------------------------------------------

export const SCORE_MIN = 0;
export const SCORE_MAX = 1000;

/** Tier thresholds (inclusive lower bounds) */
export const TIER_THRESHOLDS = {
  OBSERVER: 0,
  INITIATE: 200,
  TRUSTED: 400,
  GUARDIAN: 650,
  SOVEREIGN: 850,
} as const;

// ---------------------------------------------------------------------------
// Scoring Weights (must sum to 1.0)
// ---------------------------------------------------------------------------

export const SCORING_WEIGHTS = {
  PRIVACY_HYGIENE: 0.4,
  ECOSYSTEM_CONTRIBUTION: 0.3,
  PROOF_OF_HUMAN: 0.2,
  COMMUNITY_ENGAGEMENT: 0.1,
} as const;

// ---------------------------------------------------------------------------
// Component Max Scores (weighted portions of 1000)
// ---------------------------------------------------------------------------

export const COMPONENT_MAX = {
  PRIVACY_HYGIENE: 400,
  ECOSYSTEM_CONTRIBUTION: 300,
  PROOF_OF_HUMAN: 200,
  COMMUNITY_ENGAGEMENT: 100,
} as const;

// ---------------------------------------------------------------------------
// Fee Model
// ---------------------------------------------------------------------------

/** Minimum CKBytes for cell capacity (127 bytes of data) */
export const MIN_CELL_CAPACITY = BigInt(1000_0000_0000); // 1000 CKBytes in shannons

/** Recommended initial deposit buffer */
export const RECOMMENDED_DEPOSIT = BigInt(500_0000_0000); // 500 CKBytes in shannons

/** Default per-update fee */
export const DEFAULT_UPDATE_FEE = BigInt(3_0000_0000); // 3 CKBytes in shannons

/** Low balance warning threshold */
export const LOW_BALANCE_THRESHOLD = BigInt(10_0000_0000); // 10 CKBytes in shannons

// ---------------------------------------------------------------------------
// Scoring Epoch
// ---------------------------------------------------------------------------

/** Default epoch duration in CKB blocks (~24 hours at 8s/block) */
export const DEFAULT_EPOCH_DURATION_BLOCKS = 10800;

/** Score expiry: how many blocks after issuance before score becomes stale */
export const SCORE_EXPIRY_BLOCKS = 21600; // ~48 hours

// ---------------------------------------------------------------------------
// API Rate Limits
// ---------------------------------------------------------------------------

export const TWITTER_API_BASE = 'https://api.twitter.com/2';
export const GITHUB_API_BASE = 'https://api.github.com';

// ---------------------------------------------------------------------------
// Privacy / ZK Repository Keywords (for GitHub scoring)
// ---------------------------------------------------------------------------

export const PRIVACY_REPO_KEYWORDS = [
  'privacy',
  'private',
  'zero-knowledge',
  'zk-snark',
  'zk-stark',
  'zkp',
  'groth16',
  'plonk',
  'halo2',
  'sp1',
  'risc0',
  'noir',
  'circom',
  'ckb',
  'nervos',
  'utxo',
  'shielded',
  'mixer',
  'tornado',
  'obscura',
  'confidential',
  'mpc',
  'fhe',
  'homomorphic',
  'ring-signature',
] as const;

// ---------------------------------------------------------------------------
// Proof Worker
// ---------------------------------------------------------------------------

export const PROOF_WORKER_PROVE_PATH = '/prove';
export const PROOF_WORKER_TIMEOUT_MS = 600_000; // 10 minutes — SP1 proof generation can take several minutes

