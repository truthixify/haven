/**
 * Haven Protocol on-chain script information.
 *
 * Contains code hashes, deploy out-points, and helpers for building
 * Script objects for Haven cells. Placeholder values will be replaced
 * after on-chain deployment.
 */

import { ccc } from '@ckb-ccc/core';
import {
  HAVEN_TYPE_SCRIPT_CODE_HASH,
  HAVEN_TYPE_SCRIPT_HASH_TYPE,
  HAVEN_LOCK_SCRIPT_CODE_HASH,
  HAVEN_LOCK_SCRIPT_HASH_TYPE,
  HAVEN_REGISTRY_CODE_HASH,
  HAVEN_REGISTRY_HASH_TYPE,
} from '../constants';

// ---------------------------------------------------------------------------
// Script info types
// ---------------------------------------------------------------------------

export interface ScriptDeployInfo {
  /** Code hash of the deployed script (hex, 32 bytes with 0x prefix). */
  codeHash: string;
  /** Hash type used by the script. */
  hashType: 'type' | 'data' | 'data1' | 'data2';
  /** Transaction hash of the deploy transaction. Placeholder until deployed. */
  txHash: string;
  /** Output index in the deploy transaction. */
  index: number;
  /** Cell dep dep_type. */
  depType: 'depGroup' | 'code';
}

// ---------------------------------------------------------------------------
// Deploy info — placeholders until on-chain deployment
// ---------------------------------------------------------------------------

/**
 * Haven Score cell type script deploy info.
 * The type script validates SP1 proofs and enforces score update rules.
 */
export const SCORE_TYPE_SCRIPT_INFO: ScriptDeployInfo = {
  codeHash: HAVEN_TYPE_SCRIPT_CODE_HASH,
  hashType: HAVEN_TYPE_SCRIPT_HASH_TYPE,
  txHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
  index: 0,
  depType: 'code',
};

/**
 * Haven dual-path lock script deploy info.
 * Path 1: TEE can update with valid SP1 proof.
 * Path 2: User can always unlock with their private key.
 */
export const LOCK_SCRIPT_INFO: ScriptDeployInfo = {
  codeHash: HAVEN_LOCK_SCRIPT_CODE_HASH,
  hashType: HAVEN_LOCK_SCRIPT_HASH_TYPE,
  txHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
  index: 0,
  depType: 'code',
};

/**
 * Haven Registry cell type script deploy info.
 * The registry cell stores protocol configuration.
 */
export const REGISTRY_TYPE_SCRIPT_INFO: ScriptDeployInfo = {
  codeHash: HAVEN_REGISTRY_CODE_HASH,
  hashType: HAVEN_REGISTRY_HASH_TYPE,
  txHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
  index: 0,
  depType: 'code',
};

// ---------------------------------------------------------------------------
// Script builders
// ---------------------------------------------------------------------------

/**
 * Build a Haven Score type script.
 *
 * The type script args contain the owner's lock script hash, ensuring
 * one score cell per user.
 *
 * @param ownerLockHash - Owner's lock script hash (hex with 0x prefix).
 * @param info          - Optional override deploy info.
 * @returns A ccc.Script for the Haven Score type.
 */
export function buildScoreTypeScript(
  ownerLockHash: string,
  info?: Partial<ScriptDeployInfo>,
): ccc.Script {
  return ccc.Script.from({
    codeHash: info?.codeHash ?? SCORE_TYPE_SCRIPT_INFO.codeHash,
    hashType: info?.hashType ?? SCORE_TYPE_SCRIPT_INFO.hashType,
    args: ownerLockHash,
  });
}

/**
 * Build a Haven dual-path lock script.
 *
 * The lock script args encode both the TEE's public key hash and
 * the user's lock hash, enabling the dual-path unlock mechanism.
 *
 * Args layout: user_lock_hash (32 bytes) + tee_pubkey_hash (20 bytes) = 52 bytes
 *
 * @param userLockHash  - Owner's lock script hash (hex, 32 bytes).
 * @param teePubKeyHash - TEE's secp256k1 public key hash (hex, 20 bytes).
 * @param info          - Optional override deploy info.
 * @returns A ccc.Script for the Haven dual-path lock.
 */
export function buildHavenLockScript(
  userLockHash: string,
  teePubKeyHash: string,
  info?: Partial<ScriptDeployInfo>,
): ccc.Script {
  // Normalize and concatenate args
  const userHash = userLockHash.startsWith('0x') ? userLockHash.slice(2) : userLockHash;
  const teeHash = teePubKeyHash.startsWith('0x') ? teePubKeyHash.slice(2) : teePubKeyHash;
  const args = '0x' + userHash + teeHash;

  return ccc.Script.from({
    codeHash: info?.codeHash ?? LOCK_SCRIPT_INFO.codeHash,
    hashType: info?.hashType ?? LOCK_SCRIPT_INFO.hashType,
    args,
  });
}

/**
 * Build the Haven Registry type script (no args — singleton cell).
 *
 * @param info - Optional override deploy info.
 * @returns A ccc.Script for the Haven Registry type.
 */
export function buildRegistryTypeScript(
  info?: Partial<ScriptDeployInfo>,
): ccc.Script {
  return ccc.Script.from({
    codeHash: info?.codeHash ?? REGISTRY_TYPE_SCRIPT_INFO.codeHash,
    hashType: info?.hashType ?? REGISTRY_TYPE_SCRIPT_INFO.hashType,
    args: '0x',
  });
}

// ---------------------------------------------------------------------------
// Cell dep builders
// ---------------------------------------------------------------------------

/**
 * Build a CellDep for the Haven Score type script.
 *
 * @param info - Optional override deploy info.
 * @returns A CellDep object to include in transactions.
 */
export function buildScoreTypeCellDep(info?: Partial<ScriptDeployInfo>): ccc.CellDep {
  return ccc.CellDep.from({
    outPoint: {
      txHash: info?.txHash ?? SCORE_TYPE_SCRIPT_INFO.txHash,
      index: info?.index ?? SCORE_TYPE_SCRIPT_INFO.index,
    },
    depType: info?.depType ?? SCORE_TYPE_SCRIPT_INFO.depType,
  });
}

/**
 * Build a CellDep for the Haven lock script.
 *
 * @param info - Optional override deploy info.
 * @returns A CellDep object to include in transactions.
 */
export function buildLockCellDep(info?: Partial<ScriptDeployInfo>): ccc.CellDep {
  return ccc.CellDep.from({
    outPoint: {
      txHash: info?.txHash ?? LOCK_SCRIPT_INFO.txHash,
      index: info?.index ?? LOCK_SCRIPT_INFO.index,
    },
    depType: info?.depType ?? LOCK_SCRIPT_INFO.depType,
  });
}

/**
 * Build a CellDep for the Haven Registry type script.
 *
 * @param info - Optional override deploy info.
 * @returns A CellDep object to include in transactions.
 */
export function buildRegistryCellDep(info?: Partial<ScriptDeployInfo>): ccc.CellDep {
  return ccc.CellDep.from({
    outPoint: {
      txHash: info?.txHash ?? REGISTRY_TYPE_SCRIPT_INFO.txHash,
      index: info?.index ?? REGISTRY_TYPE_SCRIPT_INFO.index,
    },
    depType: info?.depType ?? REGISTRY_TYPE_SCRIPT_INFO.depType,
  });
}
