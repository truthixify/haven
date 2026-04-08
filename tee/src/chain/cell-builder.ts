import { ScoreCellData, ScoreBreakdown } from '../common/types';
import {
  CELL_LAYOUT,
  SCORE_CELL_TOTAL_BYTES,
  SCORE_CELL_VERSION,
} from '../common/constants';

/**
 * Cell Builder
 *
 * Serializes and deserializes the 127-byte Haven Score cell data structure.
 *
 * Layout (127 bytes total):
 * ┌─────────────────────┬───────┬─────────────────────────────────────┐
 * │ Field               │ Bytes │ Offset                              │
 * ├─────────────────────┼───────┼─────────────────────────────────────┤
 * │ version             │ 1     │ 0                                   │
 * │ score               │ 2     │ 1                                   │
 * │ epoch               │ 4     │ 3                                   │
 * │ user_identity       │ 32    │ 7                                   │
 * │ program_hash        │ 32    │ 39                                  │
 * │ proof_hash          │ 32    │ 71                                  │
 * │ score_breakdown     │ 8     │ 103 (4 x u16: priv,contrib,hum,com)│
 * │ issued_at           │ 4     │ 111                                 │
 * │ expires_at          │ 4     │ 115                                 │
 * │ deposit_balance     │ 8     │ 119                                 │
 * └─────────────────────┴───────┴─────────────────────────────────────┘
 *
 * All multi-byte integers are stored in little-endian format
 * (matching CKB convention).
 */

/**
 * Serialize score cell data to a 127-byte buffer for on-chain storage.
 */
export function serializeScoreCellData(data: ScoreCellData): Buffer {
  const buf = Buffer.alloc(SCORE_CELL_TOTAL_BYTES);

  // version (1 byte)
  buf.writeUInt8(data.version, CELL_LAYOUT.VERSION_OFFSET);

  // score (2 bytes, little-endian)
  buf.writeUInt16LE(data.score, CELL_LAYOUT.SCORE_OFFSET);

  // epoch (4 bytes, little-endian)
  buf.writeUInt32LE(data.epoch, CELL_LAYOUT.EPOCH_OFFSET);

  // user_identity (32 bytes)
  data.userIdentity.copy(buf, CELL_LAYOUT.USER_IDENTITY_OFFSET, 0, 32);

  // program_hash (32 bytes)
  data.programHash.copy(buf, CELL_LAYOUT.PROGRAM_HASH_OFFSET, 0, 32);

  // proof_hash (32 bytes)
  data.proofHash.copy(buf, CELL_LAYOUT.PROOF_HASH_OFFSET, 0, 32);

  // score_breakdown (8 bytes: 4 x u16 little-endian)
  const breakdownOffset = CELL_LAYOUT.SCORE_BREAKDOWN_OFFSET;
  buf.writeUInt16LE(data.scoreBreakdown.privacy, breakdownOffset);
  buf.writeUInt16LE(data.scoreBreakdown.contribution, breakdownOffset + 2);
  buf.writeUInt16LE(data.scoreBreakdown.humanity, breakdownOffset + 4);
  buf.writeUInt16LE(data.scoreBreakdown.community, breakdownOffset + 6);

  // issued_at (4 bytes, little-endian)
  buf.writeUInt32LE(data.issuedAt, CELL_LAYOUT.ISSUED_AT_OFFSET);

  // expires_at (4 bytes, little-endian)
  buf.writeUInt32LE(data.expiresAt, CELL_LAYOUT.EXPIRES_AT_OFFSET);

  // deposit_balance (8 bytes, little-endian u64)
  buf.writeBigUInt64LE(data.depositBalance, CELL_LAYOUT.DEPOSIT_BALANCE_OFFSET);

  return buf;
}

/**
 * Deserialize a 127-byte buffer from on-chain storage to score cell data.
 */
export function deserializeScoreCellData(buf: Buffer): ScoreCellData {
  if (buf.length !== SCORE_CELL_TOTAL_BYTES) {
    throw new Error(
      `Invalid score cell data length: ${buf.length} (expected ${SCORE_CELL_TOTAL_BYTES})`,
    );
  }

  // version
  const version = buf.readUInt8(CELL_LAYOUT.VERSION_OFFSET);

  // score
  const score = buf.readUInt16LE(CELL_LAYOUT.SCORE_OFFSET);

  // epoch
  const epoch = buf.readUInt32LE(CELL_LAYOUT.EPOCH_OFFSET);

  // user_identity
  const userIdentity = Buffer.alloc(32);
  buf.copy(
    userIdentity,
    0,
    CELL_LAYOUT.USER_IDENTITY_OFFSET,
    CELL_LAYOUT.USER_IDENTITY_OFFSET + 32,
  );

  // program_hash
  const programHash = Buffer.alloc(32);
  buf.copy(
    programHash,
    0,
    CELL_LAYOUT.PROGRAM_HASH_OFFSET,
    CELL_LAYOUT.PROGRAM_HASH_OFFSET + 32,
  );

  // proof_hash
  const proofHash = Buffer.alloc(32);
  buf.copy(
    proofHash,
    0,
    CELL_LAYOUT.PROOF_HASH_OFFSET,
    CELL_LAYOUT.PROOF_HASH_OFFSET + 32,
  );

  // score_breakdown
  const breakdownOffset = CELL_LAYOUT.SCORE_BREAKDOWN_OFFSET;
  const scoreBreakdown: ScoreBreakdown = {
    privacy: buf.readUInt16LE(breakdownOffset),
    contribution: buf.readUInt16LE(breakdownOffset + 2),
    humanity: buf.readUInt16LE(breakdownOffset + 4),
    community: buf.readUInt16LE(breakdownOffset + 6),
  };

  // issued_at
  const issuedAt = buf.readUInt32LE(CELL_LAYOUT.ISSUED_AT_OFFSET);

  // expires_at
  const expiresAt = buf.readUInt32LE(CELL_LAYOUT.EXPIRES_AT_OFFSET);

  // deposit_balance
  const depositBalance = buf.readBigUInt64LE(
    CELL_LAYOUT.DEPOSIT_BALANCE_OFFSET,
  );

  return {
    version,
    score,
    epoch,
    userIdentity,
    programHash,
    proofHash,
    scoreBreakdown,
    issuedAt,
    expiresAt,
    depositBalance,
  };
}

/**
 * Create initial score cell data for a new user.
 */
export function createInitialScoreCellData(
  userIdentity: Buffer,
  depositBalance: bigint,
  currentBlockNumber: number,
  expiryBlocks: number,
): ScoreCellData {
  return {
    version: SCORE_CELL_VERSION,
    score: 0,
    epoch: 0,
    userIdentity,
    programHash: Buffer.alloc(32),
    proofHash: Buffer.alloc(32),
    scoreBreakdown: {
      privacy: 0,
      contribution: 0,
      humanity: 0,
      community: 0,
    },
    issuedAt: currentBlockNumber,
    expiresAt: currentBlockNumber + expiryBlocks,
    depositBalance,
  };
}

/**
 * Build updated score cell data from a scoring result.
 * Preserves the user identity and deducts the update fee from deposit.
 */
export function buildUpdatedScoreCellData(
  previous: ScoreCellData,
  score: number,
  breakdown: ScoreBreakdown,
  epoch: number,
  programHash: Buffer,
  proofHash: Buffer,
  currentBlockNumber: number,
  expiryBlocks: number,
  updateFee: bigint,
): ScoreCellData {
  const newDepositBalance =
    previous.depositBalance > updateFee
      ? previous.depositBalance - updateFee
      : BigInt(0);

  return {
    version: SCORE_CELL_VERSION,
    score,
    epoch: previous.epoch + 1, // Type script requires epoch = input_epoch + 1
    userIdentity: previous.userIdentity, // Preserved - cannot change
    programHash,
    proofHash,
    scoreBreakdown: breakdown,
    issuedAt: currentBlockNumber,
    expiresAt: currentBlockNumber + expiryBlocks,
    depositBalance: newDepositBalance,
  };
}

/**
 * Convert cell data buffer to hex string (with 0x prefix).
 */
export function cellDataToHex(data: Buffer): string {
  return '0x' + data.toString('hex');
}

/**
 * Convert hex string (with 0x prefix) to cell data buffer.
 */
export function hexToCellData(hex: string): Buffer {
  return Buffer.from(hex.replace(/^0x/, ''), 'hex');
}
