/**
 * Haven Registry cell reader.
 *
 * The Registry cell is a single global cell controlled by the Haven multisig.
 * It stores the current and previous SP1 program hashes, epoch duration,
 * deposit parameters, fee address, and tier thresholds.
 */

import { ccc } from '@ckb-ccc/core';
import type { RegistryConfig, TierName } from './types';
import {
  HAVEN_REGISTRY_CODE_HASH,
  HAVEN_REGISTRY_HASH_TYPE,
  REGISTRY_CELL_OFFSETS,
  REGISTRY_CELL_SIZE,
  TIER_THRESHOLDS,
  DEFAULT_EPOCH_DURATION,
  DEFAULT_MIN_DEPOSIT,
  DEFAULT_PER_UPDATE_FEE,
} from './constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bytesToHex(bytes: Uint8Array): string {
  return (
    '0x' +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

function readU16LE(data: Uint8Array, offset: number): number {
  return data[offset]! | (data[offset + 1]! << 8);
}

function readU32LE(data: Uint8Array, offset: number): number {
  return (
    data[offset]! |
    (data[offset + 1]! << 8) |
    (data[offset + 2]! << 16) |
    ((data[offset + 3]! << 24) >>> 0)
  );
}

function readU64LE(data: Uint8Array, offset: number): bigint {
  const lo = BigInt(readU32LE(data, offset));
  const hi = BigInt(readU32LE(data, offset + 4));
  return (hi << 32n) | lo;
}

// ---------------------------------------------------------------------------
// Registry parsing
// ---------------------------------------------------------------------------

/**
 * Parse raw registry cell data into a RegistryConfig.
 *
 * @param data - Raw cell output data from the registry cell.
 * @returns Parsed RegistryConfig.
 * @throws If data length does not match expected size.
 */
export function parseRegistryCell(data: Uint8Array): RegistryConfig {
  // Accept both old (126/139) and new (171) registry sizes
  if (data.length < 126) {
    throw new Error(
      `Invalid registry cell data length: expected >= 126 bytes, got ${data.length}`,
    );
  }

  const o = REGISTRY_CELL_OFFSETS;

  const currentProgramHash = bytesToHex(
    data.slice(o.CURRENT_PROGRAM_HASH.offset, o.CURRENT_PROGRAM_HASH.offset + o.CURRENT_PROGRAM_HASH.size),
  );

  const previousProgramHash = bytesToHex(
    data.slice(o.PREVIOUS_PROGRAM_HASH.offset, o.PREVIOUS_PROGRAM_HASH.offset + o.PREVIOUS_PROGRAM_HASH.size),
  );

  const epochDuration = readU32LE(data, o.EPOCH_DURATION.offset);
  const minDeposit = readU64LE(data, o.MIN_DEPOSIT.offset);
  const perUpdateFee = readU64LE(data, o.PER_UPDATE_FEE.offset);

  const feeAddress = bytesToHex(
    data.slice(o.FEE_ADDRESS.offset, o.FEE_ADDRESS.offset + o.FEE_ADDRESS.size),
  );

  const tierThresholds: Record<TierName, number> = {
    Observer: readU16LE(data, o.TIER_OBSERVER.offset),
    Initiate: readU16LE(data, o.TIER_INITIATE.offset),
    Trusted: readU16LE(data, o.TIER_TRUSTED.offset),
    Guardian: readU16LE(data, o.TIER_GUARDIAN.offset),
    Sovereign: readU16LE(data, o.TIER_SOVEREIGN.offset),
  };

  return {
    currentProgramHash,
    previousProgramHash,
    epochDuration,
    minDeposit,
    perUpdateFee,
    feeAddress,
    tierThresholds,
  };
}

/**
 * Build the CKB Script object for finding the Haven Registry cell.
 *
 * @param codeHash  - Override code hash (hex). Defaults to placeholder.
 * @param hashType  - Override hash type. Defaults to 'type'.
 * @returns A ccc.Script suitable for querying the registry cell.
 */
export function buildRegistryTypeScript(
  codeHash?: string,
  hashType?: 'type' | 'data' | 'data1' | 'data2',
): ccc.Script {
  return ccc.Script.from({
    codeHash: codeHash ?? HAVEN_REGISTRY_CODE_HASH,
    hashType: hashType ?? HAVEN_REGISTRY_HASH_TYPE,
    args: '0x',
  });
}

/**
 * Fetch and parse the Haven Registry cell from CKB.
 *
 * @param client    - CCC client instance.
 * @param codeHash  - Override code hash (hex).
 * @param hashType  - Override hash type.
 * @returns Parsed RegistryConfig, or null if the registry cell is not found.
 */
export async function fetchRegistryConfig(
  client: ccc.Client,
  codeHash?: string,
  hashType?: 'type' | 'data' | 'data1' | 'data2',
): Promise<RegistryConfig | null> {
  const typeScript = buildRegistryTypeScript(codeHash, hashType);

  const collector = client.findCellsByType(typeScript, true);

  for await (const cell of collector) {
    const outputData = cell.outputData;
    if (!outputData) continue;

    const dataHex = typeof outputData === 'string' ? outputData : ccc.hexFrom(outputData);
    const clean = dataHex.startsWith('0x') ? dataHex.slice(2) : dataHex;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
      bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
    }

    if (bytes.length === REGISTRY_CELL_SIZE) {
      return parseRegistryCell(bytes);
    }
  }

  return null;
}

/**
 * Return sensible default registry config when the on-chain cell cannot be found.
 * Uses the tier thresholds and fee parameters from constants.
 */
export function getDefaultRegistryConfig(): RegistryConfig {
  return {
    currentProgramHash: '0x' + '00'.repeat(32),
    previousProgramHash: '0x' + '00'.repeat(32),
    epochDuration: DEFAULT_EPOCH_DURATION,
    minDeposit: DEFAULT_MIN_DEPOSIT,
    perUpdateFee: DEFAULT_PER_UPDATE_FEE,
    feeAddress: '0x' + '00'.repeat(32),
    tierThresholds: { ...TIER_THRESHOLDS },
  };
}
