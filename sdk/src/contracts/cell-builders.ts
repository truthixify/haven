/**
 * Cell builders for Haven Protocol.
 *
 * Helpers to construct Haven Score cells and Registry cells for
 * on-chain transactions. Used by the TEE when submitting score updates,
 * and by users when creating initial score cells or topping up deposits.
 */

import { ccc } from '@ckb-ccc/core';
import type { ScoreBreakdown, RegistryConfig, TierName } from '../types';
import { serializeScoreCell, type SerializeScoreCellInput } from '../cell-parser';
import {
  SCORE_CELL_SIZE,
  REGISTRY_CELL_SIZE,
  REGISTRY_CELL_OFFSETS,
  HAVEN_REGISTRY_CODE_HASH,
  DEFAULT_EPOCH_DURATION,
  DEFAULT_MIN_DEPOSIT,
  DEFAULT_PER_UPDATE_FEE,
  TIER_THRESHOLDS,
} from '../constants';
import {
  buildScoreTypeScript,
  buildHavenLockScript,
  buildScoreTypeCellDep,
  buildLockCellDep,
  buildRegistryCellDep,
  type ScriptDeployInfo,
} from './script-info';

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

function bytesToHex(bytes: Uint8Array): string {
  return (
    '0x' +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

function writeU16LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
}

function writeU32LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >> 8) & 0xff;
  data[offset + 2] = (value >> 16) & 0xff;
  data[offset + 3] = (value >> 24) & 0xff;
}

function writeU64LE(data: Uint8Array, offset: number, value: bigint): void {
  const lo = Number(value & 0xffffffffn);
  const hi = Number((value >> 32n) & 0xffffffffn);
  writeU32LE(data, offset, lo);
  writeU32LE(data, offset + 4, hi);
}

// ---------------------------------------------------------------------------
// Score cell builder
// ---------------------------------------------------------------------------

/**
 * Options for building a Haven Score cell output.
 */
export interface BuildScoreCellOptions {
  /** Owner's lock script hash (hex, 32 bytes with 0x prefix). */
  ownerLockHash: string;
  /** TEE's secp256k1 public key hash (hex, 20 bytes with 0x prefix). */
  teePubKeyHash: string;
  /** Score cell data fields. */
  scoreData: SerializeScoreCellInput;
  /** Cell capacity in shannons. If omitted, uses minimum capacity for 127 bytes. */
  capacity?: bigint;
  /** Optional deploy info overrides. */
  typeScriptInfo?: Partial<ScriptDeployInfo>;
  lockScriptInfo?: Partial<ScriptDeployInfo>;
}

/**
 * Build a Haven Score cell output suitable for inclusion in a CKB transaction.
 *
 * @param options - Score cell configuration.
 * @returns A ccc.Cell with the score cell's lock, type, capacity, and data.
 */
export function buildScoreCell(options: BuildScoreCellOptions): ccc.Cell {
  const {
    ownerLockHash,
    teePubKeyHash,
    scoreData,
    capacity,
    typeScriptInfo,
    lockScriptInfo,
  } = options;

  // Build scripts
  const lockScript = buildHavenLockScript(ownerLockHash, teePubKeyHash, lockScriptInfo);
  const typeScript = buildScoreTypeScript(ownerLockHash, typeScriptInfo);

  // Serialize cell data
  const data = serializeScoreCell(scoreData);
  const dataHex = bytesToHex(data);

  // Calculate minimum capacity: 8 (capacity) + lock_script_size + type_script_size + data_size
  // For CKB cells, minimum capacity = occupied bytes * 10^8 shannons
  // Simplified: 127 bytes data + ~61 bytes scripts + 8 bytes capacity ~ 200 CKBytes minimum
  const minCapacity = BigInt(200) * BigInt(10 ** 8); // 200 CKBytes in shannons
  const cellCapacity = capacity ?? minCapacity;

  return ccc.Cell.from({
    outPoint: {
      txHash: '0x' + '00'.repeat(32),
      index: 0,
    },
    cellOutput: {
      capacity: cellCapacity,
      lock: lockScript,
      type: typeScript,
    },
    outputData: dataHex,
  });
}

/**
 * Build an initial score cell for a new user with score = 0.
 *
 * @param ownerLockHash  - Owner's lock script hash.
 * @param teePubKeyHash  - TEE's public key hash.
 * @param userIdentity   - Blake2b hash of the user's CKB public key (hex, 32 bytes).
 * @param depositAmount  - Initial CKBytes deposit (shannons).
 * @param currentBlock   - Current CKB block number for issued_at.
 * @param epochDuration  - Blocks until the score expires. Defaults to ~24h.
 * @returns A ccc.Cell for the initial score cell.
 */
export function buildInitialScoreCell(
  ownerLockHash: string,
  teePubKeyHash: string,
  userIdentity: string,
  depositAmount: bigint,
  currentBlock: number,
  epochDuration: number = DEFAULT_EPOCH_DURATION,
): ccc.Cell {
  return buildScoreCell({
    ownerLockHash,
    teePubKeyHash,
    scoreData: {
      version: 1,
      score: 0,
      epoch: 0,
      userIdentity,
      programHash: '0x' + '00'.repeat(32),
      proofHash: '0x' + '00'.repeat(32),
      breakdown: { privacy: 0, contribution: 0, humanity: 0, community: 0 },
      issuedAt: currentBlock,
      expiresAt: currentBlock + epochDuration,
      depositBalance: depositAmount,
    },
    capacity: depositAmount,
  });
}

// ---------------------------------------------------------------------------
// Registry cell builder
// ---------------------------------------------------------------------------

/**
 * Options for building a Haven Registry cell.
 */
export interface BuildRegistryCellOptions {
  /** Current valid SP1 program hash (hex, 32 bytes). */
  currentProgramHash: string;
  /** Previous program hash for grace period (hex, 32 bytes). */
  previousProgramHash: string;
  /** Epoch duration in blocks. */
  epochDuration?: number;
  /** Minimum deposit in shannons. */
  minDeposit?: bigint;
  /** Per-update fee in shannons. */
  perUpdateFee?: bigint;
  /** Fee address (hex, 32-byte lock hash). */
  feeAddress: string;
  /** Tier thresholds override. */
  tierThresholds?: Record<TierName, number>;
}

/**
 * Serialize registry cell data into the on-chain format.
 *
 * @param options - Registry configuration fields.
 * @returns 126-byte Uint8Array for the registry cell data.
 */
export function serializeRegistryCell(options: BuildRegistryCellOptions): Uint8Array {
  const data = new Uint8Array(REGISTRY_CELL_SIZE);
  const o = REGISTRY_CELL_OFFSETS;

  // Current program hash (32 bytes)
  const currentHash = hexToBytes(options.currentProgramHash);
  if (currentHash.length !== 32) {
    throw new Error(`currentProgramHash must be 32 bytes, got ${currentHash.length}`);
  }
  data.set(currentHash, o.CURRENT_PROGRAM_HASH.offset);

  // Previous program hash (32 bytes)
  const prevHash = hexToBytes(options.previousProgramHash);
  if (prevHash.length !== 32) {
    throw new Error(`previousProgramHash must be 32 bytes, got ${prevHash.length}`);
  }
  data.set(prevHash, o.PREVIOUS_PROGRAM_HASH.offset);

  // Epoch duration (u32 LE)
  writeU32LE(data, o.EPOCH_DURATION.offset, options.epochDuration ?? DEFAULT_EPOCH_DURATION);

  // Min deposit (u64 LE)
  writeU64LE(data, o.MIN_DEPOSIT.offset, options.minDeposit ?? DEFAULT_MIN_DEPOSIT);

  // Per-update fee (u64 LE)
  writeU64LE(data, o.PER_UPDATE_FEE.offset, options.perUpdateFee ?? DEFAULT_PER_UPDATE_FEE);

  // Fee address (32 bytes)
  const feeAddr = hexToBytes(options.feeAddress);
  if (feeAddr.length !== 32) {
    throw new Error(`feeAddress must be 32 bytes, got ${feeAddr.length}`);
  }
  data.set(feeAddr, o.FEE_ADDRESS.offset);

  // Tier thresholds (5 x u16 LE)
  const thresholds = options.tierThresholds ?? TIER_THRESHOLDS;
  writeU16LE(data, o.TIER_OBSERVER.offset, thresholds.Observer);
  writeU16LE(data, o.TIER_INITIATE.offset, thresholds.Initiate);
  writeU16LE(data, o.TIER_TRUSTED.offset, thresholds.Trusted);
  writeU16LE(data, o.TIER_GUARDIAN.offset, thresholds.Guardian);
  writeU16LE(data, o.TIER_SOVEREIGN.offset, thresholds.Sovereign);

  return data;
}

/**
 * Build a complete Haven Registry cell output.
 *
 * @param options  - Registry configuration.
 * @param lockScript - Lock script for the registry cell (typically a multisig).
 * @param capacity   - Cell capacity in shannons.
 * @param registryTypeInfo - Optional deploy info override for the registry type script.
 * @returns A ccc.Cell for the registry.
 */
export function buildRegistryCell(
  options: BuildRegistryCellOptions,
  lockScript: ccc.Script,
  capacity: bigint,
  registryTypeInfo?: Partial<ScriptDeployInfo>,
): ccc.Cell {
  const data = serializeRegistryCell(options);
  const dataHex = bytesToHex(data);

  const typeScript = ccc.Script.from({
    codeHash: registryTypeInfo?.codeHash ?? HAVEN_REGISTRY_CODE_HASH,
    hashType: registryTypeInfo?.hashType ?? 'type',
    args: '0x',
  });

  return ccc.Cell.from({
    outPoint: {
      txHash: '0x' + '00'.repeat(32),
      index: 0,
    },
    cellOutput: {
      capacity,
      lock: lockScript,
      type: typeScript,
    },
    outputData: dataHex,
  });
}

// ---------------------------------------------------------------------------
// Transaction helper: collect all Haven cell deps
// ---------------------------------------------------------------------------

/**
 * Build all CellDeps required for a Haven score update transaction.
 *
 * @param overrides - Optional deploy info overrides per script.
 * @returns Array of CellDep objects.
 */
export function buildHavenCellDeps(overrides?: {
  typeScript?: Partial<ScriptDeployInfo>;
  lockScript?: Partial<ScriptDeployInfo>;
  registryScript?: Partial<ScriptDeployInfo>;
}): ccc.CellDep[] {
  return [
    buildScoreTypeCellDep(overrides?.typeScript),
    buildLockCellDep(overrides?.lockScript),
    buildRegistryCellDep(overrides?.registryScript),
  ];
}
