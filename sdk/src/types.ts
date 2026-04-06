/**
 * Haven Protocol TypeScript types.
 *
 * All types mirror the on-chain cell layout defined in the Haven Protocol spec
 * (sections 7, 11, 12).
 */

/** Score tier names ordered by ascending threshold. */
export type TierName = 'Observer' | 'Initiate' | 'Trusted' | 'Guardian' | 'Sovereign';

/**
 * Per-component score breakdown.
 * Each value represents an absolute score within the component weight cap:
 *   privacy   — 0-400  (40% of 1000)
 *   contribution — 0-300  (30%)
 *   humanity  — 0-200  (20%)
 *   community — 0-100  (10%)
 */
export interface ScoreBreakdown {
  privacy: number;
  contribution: number;
  humanity: number;
  community: number;
}

/**
 * Parsed Haven Score from an on-chain score cell.
 * All fields are public and readable by anyone querying CKB.
 */
export interface HavenScore {
  /** Cell schema version (currently 1). */
  version: number;
  /** Composite Haven Score, 0-1000. */
  score: number;
  /** Score epoch number — increments with each TEE update. */
  epoch: number;
  /** Blake2b hash of the user's CKB public key (hex, 32 bytes). */
  userIdentity: string;
  /** Hash of the SP1 scoring program used for this update (hex, 32 bytes). */
  programHash: string;
  /** Blake2b hash of the SP1 proof for auditability (hex, 32 bytes). */
  proofHash: string;
  /** Per-component score breakdown. */
  breakdown: ScoreBreakdown;
  /** CKB block number of last update. */
  issuedAt: number;
  /** Block number after which the score is considered stale. */
  expiresAt: number;
  /** Remaining pre-deposited CKBytes for update fees (in shannons). */
  depositBalance: bigint;
  /** Computed tier based on score value. */
  tier: TierName;
  /** Whether the score cell has not expired relative to the last-known block. */
  isValid: boolean;
}

/**
 * Entry in the public Haven leaderboard.
 * Contains only the publicly visible fields — no real-world identity.
 */
export interface LeaderboardEntry {
  /** Blake2b identity commitment (hex). */
  identityCommitment: string;
  /** Composite Haven Score. */
  score: number;
  /** Computed tier. */
  tier: TierName;
  /** Per-component breakdown. */
  breakdown: ScoreBreakdown;
  /** Epoch at which this score was issued. */
  epoch: number;
}

/**
 * Off-chain attestation that a user meets a score threshold.
 * Suitable for event ticketing, API gating, private channel access, etc.
 */
export interface ScoreAttestation {
  /** Whether the user's current score meets or exceeds the requested threshold. */
  meetsThreshold: boolean;
  /** The user's current tier at attestation time. */
  tier: TierName;
  /** Block number until which this attestation should be considered valid. */
  validUntil: number;
  /** Hex-encoded signature over the attestation payload. */
  signature: string;
}

/**
 * Haven Registry cell configuration.
 * A single global cell controlled by the Haven multisig.
 */
export interface RegistryConfig {
  /** Current valid SP1 scoring program hash (hex, 32 bytes). */
  currentProgramHash: string;
  /** Previous program hash retained during grace period transitions (hex, 32 bytes). */
  previousProgramHash: string;
  /** Score epoch duration in CKB blocks. */
  epochDuration: number;
  /** Minimum CKBytes deposit to create a score cell (shannons). */
  minDeposit: bigint;
  /** Fee deducted per score update (shannons). */
  perUpdateFee: bigint;
  /** Protocol fee address (hex-encoded lock script hash). */
  feeAddress: string;
  /** Score thresholds defining each tier. */
  tierThresholds: Record<TierName, number>;
}

/**
 * Raw score cell data bytes before parsing.
 * Exactly 127 bytes per the spec.
 */
export type RawScoreCellData = Uint8Array;

/**
 * Options for constructing a HavenClient.
 */
export interface HavenClientOptions {
  /** Override the Haven type script code hash (hex). Useful for testnet or custom deployments. */
  typeScriptCodeHash?: string;
  /** Override the Haven type script hash type. */
  typeScriptHashType?: 'type' | 'data' | 'data1' | 'data2';
  /** Override the Haven registry type script code hash (hex). */
  registryCodeHash?: string;
  /** Override the Haven registry type script hash type. */
  registryHashType?: 'type' | 'data' | 'data1' | 'data2';
}

/**
 * Options for fetching a sorted leaderboard.
 */
export interface LeaderboardOptions {
  /** Maximum number of entries to return. Defaults to 100. */
  limit?: number;
  /** Field to sort by. Defaults to 'score'. */
  sortBy?: 'score' | 'privacy' | 'contribution' | 'humanity' | 'community';
  /** Sort direction. Defaults to 'desc'. */
  sortDirection?: 'asc' | 'desc';
}
