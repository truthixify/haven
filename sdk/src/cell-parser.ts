/**
 * Haven Score cell data parser and serializer.
 *
 * Parses the 127-byte score cell data layout defined in spec section 7.1:
 *
 *   Byte  0        : version        (u8)
 *   Bytes 1-2      : score          (u16 LE)
 *   Bytes 3-6      : epoch          (u32 LE)
 *   Bytes 7-38     : user_identity  (32 bytes)
 *   Bytes 39-70    : program_hash   (32 bytes)
 *   Bytes 71-102   : proof_hash     (32 bytes)
 *   Bytes 103-110  : score_breakdown (4 x u16 LE: privacy, contribution, humanity, community)
 *   Bytes 111-114  : issued_at      (u32 LE)
 *   Bytes 115-118  : expires_at     (u32 LE)
 *   Bytes 119-126  : deposit_balance (u64 LE)
 *
 * Total: 127 bytes.
 */

import type { HavenScore, ScoreBreakdown, TierName } from './types';
import {
  CELL_OFFSETS,
  BREAKDOWN_OFFSETS,
  SCORE_CELL_SIZE,
  TIER_ORDER,
  TIER_THRESHOLDS,
} from './constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a byte slice to a hex string (no 0x prefix). */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Read an unsigned 16-bit little-endian integer from a buffer at the given offset. */
function readU16LE(data: Uint8Array, offset: number): number {
  return data[offset]! | (data[offset + 1]! << 8);
}

/** Read an unsigned 32-bit little-endian integer from a buffer at the given offset. */
function readU32LE(data: Uint8Array, offset: number): number {
  return (
    data[offset]! |
    (data[offset + 1]! << 8) |
    (data[offset + 2]! << 16) |
    ((data[offset + 3]! << 24) >>> 0)  // >>> 0 to keep unsigned
  );
}

/** Read an unsigned 64-bit little-endian integer from a buffer at the given offset. */
function readU64LE(data: Uint8Array, offset: number): bigint {
  const lo = BigInt(readU32LE(data, offset));
  const hi = BigInt(readU32LE(data, offset + 4));
  return (hi << 32n) | lo;
}

/** Write an unsigned 16-bit little-endian integer to a buffer at the given offset. */
function writeU16LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
}

/** Write an unsigned 32-bit little-endian integer to a buffer at the given offset. */
function writeU32LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
  data[offset + 2] = (value >> 16) & 0xff;
  data[offset + 3] = (value >> 24) & 0xff;
}

/** Write an unsigned 64-bit little-endian integer to a buffer at the given offset. */
function writeU64LE(data: Uint8Array, offset: number, value: bigint): void {
  const lo = Number(value & 0xffffffffn);
  const hi = Number((value >> 32n) & 0xffffffffn);
  writeU32LE(data, offset, lo);
  writeU32LE(data, offset + 4, hi);
}

/** Convert a hex string (with or without 0x prefix) to a Uint8Array. */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error(`Invalid hex string length: ${clean.length}`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Tier resolution
// ---------------------------------------------------------------------------

/**
 * Determine the tier for a given composite score (0-1000).
 * Iterates from highest tier downward and returns the first match.
 */
export function getTierForScore(score: number): TierName {
  for (const tier of TIER_ORDER) {
    if (score >= TIER_THRESHOLDS[tier]) {
      return tier;
    }
  }
  return 'Observer';
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse raw 127-byte score cell data into a HavenScore object.
 *
 * @param data       - Exactly 127 bytes of cell output data.
 * @param currentBlock - Optional current block number to compute `isValid`.
 *                       If omitted, `isValid` defaults to `true`.
 * @returns Parsed HavenScore.
 * @throws If data length is not exactly 127 bytes.
 */
export function parseScoreCell(data: Uint8Array, currentBlock?: number): HavenScore {
  if (data.length !== SCORE_CELL_SIZE) {
    throw new Error(
      `Invalid score cell data length: expected ${SCORE_CELL_SIZE} bytes, got ${data.length}`,
    );
  }

  // Version (u8)
  const version = data[CELL_OFFSETS.VERSION.offset]!;

  // Score (u16 LE)
  const score = readU16LE(data, CELL_OFFSETS.SCORE.offset);

  // Epoch (u32 LE)
  const epoch = readU32LE(data, CELL_OFFSETS.EPOCH.offset);

  // User identity (32 bytes)
  const userIdentityBytes = data.slice(
    CELL_OFFSETS.USER_IDENTITY.offset,
    CELL_OFFSETS.USER_IDENTITY.offset + CELL_OFFSETS.USER_IDENTITY.size,
  );
  const userIdentity = '0x' + bytesToHex(userIdentityBytes);

  // Program hash (32 bytes)
  const programHashBytes = data.slice(
    CELL_OFFSETS.PROGRAM_HASH.offset,
    CELL_OFFSETS.PROGRAM_HASH.offset + CELL_OFFSETS.PROGRAM_HASH.size,
  );
  const programHash = '0x' + bytesToHex(programHashBytes);

  // Proof hash (32 bytes)
  const proofHashBytes = data.slice(
    CELL_OFFSETS.PROOF_HASH.offset,
    CELL_OFFSETS.PROOF_HASH.offset + CELL_OFFSETS.PROOF_HASH.size,
  );
  const proofHash = '0x' + bytesToHex(proofHashBytes);

  // Score breakdown (4 x u16 LE)
  const breakdownBase = CELL_OFFSETS.SCORE_BREAKDOWN.offset;
  const breakdown: ScoreBreakdown = {
    privacy: readU16LE(data, breakdownBase + BREAKDOWN_OFFSETS.PRIVACY),
    contribution: readU16LE(data, breakdownBase + BREAKDOWN_OFFSETS.CONTRIBUTION),
    humanity: readU16LE(data, breakdownBase + BREAKDOWN_OFFSETS.HUMANITY),
    community: readU16LE(data, breakdownBase + BREAKDOWN_OFFSETS.COMMUNITY),
  };

  // Issued at (u32 LE)
  const issuedAt = readU32LE(data, CELL_OFFSETS.ISSUED_AT.offset);

  // Expires at (u32 LE)
  const expiresAt = readU32LE(data, CELL_OFFSETS.EXPIRES_AT.offset);

  // Deposit balance (u64 LE)
  const depositBalance = readU64LE(data, CELL_OFFSETS.DEPOSIT_BALANCE.offset);

  // Derived fields
  const tier = getTierForScore(score);
  const isValid = currentBlock !== undefined ? currentBlock < expiresAt : true;

  return {
    version,
    score,
    epoch,
    userIdentity,
    programHash,
    proofHash,
    breakdown,
    issuedAt,
    expiresAt,
    depositBalance,
    tier,
    isValid,
  };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Input for serializing a score cell.
 * Matches HavenScore but omits derived fields (tier, isValid).
 */
export interface SerializeScoreCellInput {
  version: number;
  score: number;
  epoch: number;
  /** Hex string (with or without 0x prefix), must be 32 bytes. */
  userIdentity: string;
  /** Hex string (with or without 0x prefix), must be 32 bytes. */
  programHash: string;
  /** Hex string (with or without 0x prefix), must be 32 bytes. */
  proofHash: string;
  breakdown: ScoreBreakdown;
  issuedAt: number;
  expiresAt: number;
  depositBalance: bigint;
}

/**
 * Serialize a score cell input into the 127-byte on-chain format.
 *
 * @param input - Score cell fields to serialize.
 * @returns 127-byte Uint8Array ready to be used as cell output data.
 * @throws If any field is out of range or hex values have wrong length.
 */
export function serializeScoreCell(input: SerializeScoreCellInput): Uint8Array {
  const data = new Uint8Array(SCORE_CELL_SIZE);

  // Version (u8)
  if (input.version < 0 || input.version > 255) {
    throw new Error(`Version out of range: ${input.version}`);
  }
  data[CELL_OFFSETS.VERSION.offset] = input.version;

  // Score (u16 LE)
  if (input.score < 0 || input.score > 1000) {
    throw new Error(`Score out of range (0-1000): ${input.score}`);
  }
  writeU16LE(data, CELL_OFFSETS.SCORE.offset, input.score);

  // Epoch (u32 LE)
  writeU32LE(data, CELL_OFFSETS.EPOCH.offset, input.epoch);

  // User identity (32 bytes)
  const userIdentityBytes = hexToBytes(input.userIdentity);
  if (userIdentityBytes.length !== 32) {
    throw new Error(`userIdentity must be 32 bytes, got ${userIdentityBytes.length}`);
  }
  data.set(userIdentityBytes, CELL_OFFSETS.USER_IDENTITY.offset);

  // Program hash (32 bytes)
  const programHashBytes = hexToBytes(input.programHash);
  if (programHashBytes.length !== 32) {
    throw new Error(`programHash must be 32 bytes, got ${programHashBytes.length}`);
  }
  data.set(programHashBytes, CELL_OFFSETS.PROGRAM_HASH.offset);

  // Proof hash (32 bytes)
  const proofHashBytes = hexToBytes(input.proofHash);
  if (proofHashBytes.length !== 32) {
    throw new Error(`proofHash must be 32 bytes, got ${proofHashBytes.length}`);
  }
  data.set(proofHashBytes, CELL_OFFSETS.PROOF_HASH.offset);

  // Score breakdown (4 x u16 LE)
  const breakdownBase = CELL_OFFSETS.SCORE_BREAKDOWN.offset;

  if (input.breakdown.privacy < 0 || input.breakdown.privacy > 400) {
    throw new Error(`Privacy score out of range (0-400): ${input.breakdown.privacy}`);
  }
  writeU16LE(data, breakdownBase + BREAKDOWN_OFFSETS.PRIVACY, input.breakdown.privacy);

  if (input.breakdown.contribution < 0 || input.breakdown.contribution > 300) {
    throw new Error(`Contribution score out of range (0-300): ${input.breakdown.contribution}`);
  }
  writeU16LE(data, breakdownBase + BREAKDOWN_OFFSETS.CONTRIBUTION, input.breakdown.contribution);

  if (input.breakdown.humanity < 0 || input.breakdown.humanity > 200) {
    throw new Error(`Humanity score out of range (0-200): ${input.breakdown.humanity}`);
  }
  writeU16LE(data, breakdownBase + BREAKDOWN_OFFSETS.HUMANITY, input.breakdown.humanity);

  if (input.breakdown.community < 0 || input.breakdown.community > 100) {
    throw new Error(`Community score out of range (0-100): ${input.breakdown.community}`);
  }
  writeU16LE(data, breakdownBase + BREAKDOWN_OFFSETS.COMMUNITY, input.breakdown.community);

  // Issued at (u32 LE)
  writeU32LE(data, CELL_OFFSETS.ISSUED_AT.offset, input.issuedAt);

  // Expires at (u32 LE)
  writeU32LE(data, CELL_OFFSETS.EXPIRES_AT.offset, input.expiresAt);

  // Deposit balance (u64 LE)
  writeU64LE(data, CELL_OFFSETS.DEPOSIT_BALANCE.offset, input.depositBalance);

  return data;
}
