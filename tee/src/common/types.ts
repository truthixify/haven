/**
 * Haven Protocol - Shared TypeScript Types
 *
 * All interfaces match the protocol specification in haven_protocol_ckb.md.
 */

// ---------------------------------------------------------------------------
// Score Tiers
// ---------------------------------------------------------------------------

export enum ScoreTier {
  Observer = 'Observer',
  Initiate = 'Initiate',
  Trusted = 'Trusted',
  Guardian = 'Guardian',
  Sovereign = 'Sovereign',
}

// ---------------------------------------------------------------------------
// Score Breakdown (packed as 4 x u16 = 8 bytes on-chain)
// ---------------------------------------------------------------------------

export interface ScoreBreakdown {
  /** Privacy Hygiene sub-score (0-400, 40% weight applied to 0-1000 range) */
  privacy: number;
  /** Ecosystem Contribution sub-score (0-300, 30% weight) */
  contribution: number;
  /** Proof of Human sub-score (0-200, 20% weight) */
  humanity: number;
  /** Community Engagement sub-score (0-100, 10% weight) */
  community: number;
}

// ---------------------------------------------------------------------------
// Score Cell Data (127 bytes on-chain)
// ---------------------------------------------------------------------------

export interface ScoreCellData {
  /** Cell schema version (1 byte) */
  version: number;
  /** Haven Score, u16, 0-1000 (2 bytes) */
  score: number;
  /** Score epoch number, u32 (4 bytes) */
  epoch: number;
  /** Blake2b hash of CKB public key (32 bytes) */
  userIdentity: Buffer;
  /** Hash of SP1 scoring program (32 bytes) */
  programHash: Buffer;
  /** Blake2b hash of the SP1 proof (32 bytes) */
  proofHash: Buffer;
  /** Packed component scores (8 bytes) */
  scoreBreakdown: ScoreBreakdown;
  /** CKB block number of last update (4 bytes) */
  issuedAt: number;
  /** Block number after which score is stale (4 bytes) */
  expiresAt: number;
  /** Remaining pre-deposited CKBytes, u64 (8 bytes) */
  depositBalance: bigint;
}

// ---------------------------------------------------------------------------
// Registry Cell Data
// ---------------------------------------------------------------------------

export interface RegistryCellData {
  currentProgramHash: Buffer;
  previousProgramHash: Buffer;
  epochDurationBlocks: number;
  minimumDeposit: bigint;
  perUpdateFee: bigint;
  protocolFeeAddress: string;
  tierThresholds: TierThresholds;
}

export interface TierThresholds {
  observer: number;
  initiate: number;
  trusted: number;
  guardian: number;
  sovereign: number;
}

// ---------------------------------------------------------------------------
// User Identity
// ---------------------------------------------------------------------------

export interface UserIdentity {
  /** Blake2b hash of CKB public key */
  identityCommitment: Buffer;
  /** CKB public key (kept only in sealed storage) */
  ckbPubKey: string;
}

// ---------------------------------------------------------------------------
// Sealed User Record (stored encrypted in TEE sealed storage)
// ---------------------------------------------------------------------------

export interface SealedUserRecord {
  /** Blake2b hash of CKB public key - primary key */
  identityCommitment: string;
  /** CKB public key */
  ckbPubKey: string;
  /** Last scoring epoch completed */
  lastScoredEpoch?: number;
  /** Last computed score (stored in DB, may differ from on-chain) */
  lastComputedScore?: number;
  /** CKB outpoint of current score cell */
  scoreCellOutpoint?: CellOutpoint;
}

// ---------------------------------------------------------------------------
// Connection Record (stored in connections table)
// ---------------------------------------------------------------------------

export interface ConnectionRecord {
  /** Provider name ('twitter', 'github', 'linkedin', 'discord', etc.) */
  provider: string;
  /** User's ID on that platform */
  providerId: string;
  /** OAuth access token (never leaves TEE) */
  accessToken?: string | null;
  /** OAuth refresh token (never leaves TEE) */
  refreshToken?: string | null;
  /** Provider-specific metadata (username, avatar, etc.) */
  metadata?: Record<string, unknown> | null;
  /** How much this provider contributes to reputation score (0-100) */
  reputationWeight: number;
}

export interface CellOutpoint {
  txHash: string;
  index: number;
}

// ---------------------------------------------------------------------------
// Activity Data (collected by collectors, used by scoring formulas)
// ---------------------------------------------------------------------------

export interface TwitterActivity {
  accountAge: number;
  followerCount: number;
  followingCount: number;
  tweetCount: number;
  recentTweets: number;
  recentRetweets: number;
  recentLikes: number;
  recentReplies: number;
  privacyMentions: number;
  zkMentions: number;
  accountVerified: boolean;
}

export interface GitHubActivity {
  accountAge: number;
  publicRepos: number;
  totalCommitsLastYear: number;
  privacyRepoCommits: number;
  zkRepoCommits: number;
  pullRequestCount: number;
  issueCount: number;
  contributedToOrgs: number;
  recentCommits: number;
  hasNodeRepo: boolean;
}

export interface OnChainActivity {
  totalTransactions: number;
  recentTransactions: number;
  uniqueAddressesUsed: number;
  shieldedPoolUsage: number;
  privacyProtocolBalances: bigint;
  addressRotationCount: number;
  cellCount: number;
  daoDeposits: number;
  accountAgeDays: number;
}

export interface CollectedActivity {
  twitter?: TwitterActivity;
  github?: GitHubActivity;
  onchain: OnChainActivity;
}

// ---------------------------------------------------------------------------
// Attestation Types
// ---------------------------------------------------------------------------

export interface DCAPAttestation {
  /** Base64-encoded TDX attestation quote from dstack */
  report: string;
  /** JSON event log from TDX quote */
  eventLog: string;
  /** RTMR measurement register values */
  rtmrs: string[];
  /** Timestamp of attestation generation */
  timestamp: number;
  /** Program hash attested */
  programHash: string;
  /** Identity commitment attested */
  identityCommitment: string;
  /** Score attested */
  score: number;
  /** Epoch attested */
  epoch: number;
  /** Score breakdown */
  breakdown: ScoreBreakdown;
}

export interface SP1ProofResult {
  /** Raw proof bytes (hex-encoded) */
  proofBytes: string;
  /** Blake2b hash of the proof */
  proofHash: string;
  /** Public inputs used */
  publicInputs: SP1PublicInputs;
  /** SP1 verification key hash, hex-encoded (32 bytes) */
  vkHash: string;
}

export interface SP1PublicInputs {
  programHash: string;
  identityCommitment: string;
  previousScore: number;
  newScore: number;
  epoch: number;
  /** Privacy Hygiene sub-score (0-1000) */
  privacyScore: number;
  /** Ecosystem Contribution sub-score (0-1000) */
  contributionScore: number;
  /** Proof of Human sub-score (0-1000) */
  humanityScore: number;
  /** Community Engagement sub-score (0-1000) */
  communityScore: number;
  /** Previous epoch number from the input score cell */
  prevEpoch: number;
}

// ---------------------------------------------------------------------------
// Scoring Result
// ---------------------------------------------------------------------------

export interface ScoringResult {
  score: number;
  breakdown: ScoreBreakdown;
  epoch: number;
  identityCommitment: string;
}
