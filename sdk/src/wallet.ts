/**
 * Wallet helpers for Haven Protocol.
 *
 * Provides utilities for identity message creation, score lookups
 * using a CCC signer, and deposit top-up transaction building.
 */

import { ccc } from '@ckb-ccc/core';
import type { HavenScore } from './types';
import type { HavenClient } from './client';
import {
  HAVEN_TYPE_SCRIPT_CODE_HASH,
  HAVEN_TYPE_SCRIPT_HASH_TYPE,
  HAVEN_LOCK_SCRIPT_CODE_HASH,
  HAVEN_LOCK_SCRIPT_HASH_TYPE,
  SCORE_CELL_SIZE,
} from './constants';
import { parseScoreCell } from './cell-parser';

// ---------------------------------------------------------------------------
// Identity message
// ---------------------------------------------------------------------------

/**
 * Create the standard Haven identity message for signing.
 *
 * This message is signed by the user's wallet and sent to the TEE
 * for identity verification and commitment generation.
 *
 * @param ckbAddress - The user's CKB address.
 * @returns A deterministic identity message string.
 */
export function createIdentityMessage(ckbAddress: string): string {
  return `Haven Protocol Identity Registration\nAddress: ${ckbAddress}\nTimestamp: ${Date.now()}`;
}

// ---------------------------------------------------------------------------
// Score lookup via signer
// ---------------------------------------------------------------------------

/**
 * Get the current user's Haven Score using a CCC signer.
 *
 * Resolves the signer's lock script hash automatically and looks up
 * the score cell on-chain.
 *
 * @param client - A HavenClient instance.
 * @param signer - A CCC signer instance (e.g. from connector-react).
 * @returns The parsed HavenScore, or `null` if no score cell exists.
 */
export async function getMyScore(
  client: HavenClient,
  signer: ccc.Signer,
): Promise<HavenScore | null> {
  const addressObj = await signer.getRecommendedAddressObj();
  const lockHash = addressObj.script.hash();
  return client.getScore(lockHash);
}

// ---------------------------------------------------------------------------
// Deposit top-up transaction
// ---------------------------------------------------------------------------

/**
 * Options for building a deposit top-up transaction.
 */
export interface BuildDepositTopUpOptions {
  /** CCC client instance for on-chain queries. */
  cccClient: ccc.Client;
  /** CCC signer instance for signing and address resolution. */
  signer: ccc.Signer;
  /** OutPoint of the existing score cell to top up. */
  scoreCellOutpoint: { txHash: string; index: number };
  /** Top-up amount in shannons. */
  topUpAmount: bigint;
}

/**
 * Build a deposit top-up transaction using Path 2 (user key).
 *
 * The transaction consumes the existing score cell and produces a new
 * one with the deposit_balance increased by the top-up amount.
 *
 * @param options - Transaction building options.
 * @returns A CCC Transaction ready for signing and submission.
 * @throws If the score cell cannot be found or is invalid.
 */
export async function buildDepositTopUp(
  options: BuildDepositTopUpOptions,
): Promise<ccc.Transaction> {
  const { cccClient, signer, scoreCellOutpoint, topUpAmount } = options;

  // Resolve the outpoint
  const outPoint = ccc.OutPoint.from({
    txHash: scoreCellOutpoint.txHash,
    index: scoreCellOutpoint.index,
  });

  // Fetch the existing score cell
  const liveCell = await cccClient.getCellLive(outPoint, true);
  if (!liveCell) {
    throw new Error(
      `Score cell not found at outpoint ${scoreCellOutpoint.txHash}:${scoreCellOutpoint.index}`,
    );
  }

  // Parse the existing cell data to update deposit_balance
  const dataHex = typeof liveCell.outputData === 'string'
    ? liveCell.outputData
    : ccc.hexFrom(liveCell.outputData);
  const clean = dataHex.startsWith('0x') ? dataHex.slice(2) : dataHex;
  const existingData = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    existingData[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }

  if (existingData.length !== SCORE_CELL_SIZE) {
    throw new Error(
      `Invalid score cell data length: expected ${SCORE_CELL_SIZE}, got ${existingData.length}`,
    );
  }

  // Parse existing score to read current deposit balance
  const existingScore = parseScoreCell(existingData);
  const newDepositBalance = existingScore.depositBalance + topUpAmount;

  // Update deposit_balance in-place (bytes 119-126, u64 LE)
  const updatedData = new Uint8Array(existingData);
  const balanceLo = Number(newDepositBalance & 0xffffffffn);
  const balanceHi = Number((newDepositBalance >> 32n) & 0xffffffffn);
  updatedData[119] = balanceLo & 0xff;
  updatedData[120] = (balanceLo >> 8) & 0xff;
  updatedData[121] = (balanceLo >> 16) & 0xff;
  updatedData[122] = (balanceLo >> 24) & 0xff;
  updatedData[123] = balanceHi & 0xff;
  updatedData[124] = (balanceHi >> 8) & 0xff;
  updatedData[125] = (balanceHi >> 16) & 0xff;
  updatedData[126] = (balanceHi >> 24) & 0xff;

  const updatedDataHex =
    '0x' +
    Array.from(updatedData)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  // Build the transaction
  const newCapacity = liveCell.cellOutput.capacity + topUpAmount;

  const tx = ccc.Transaction.from({
    inputs: [{ previousOutput: outPoint }],
    outputs: [
      {
        capacity: newCapacity,
        lock: liveCell.cellOutput.lock,
        type: liveCell.cellOutput.type,
      },
    ],
    outputsData: [updatedDataHex],
  });

  // Let CCC handle input collection for the top-up amount and fees
  await tx.completeInputsByCapacity(signer);
  await tx.completeFeeBy(signer, 1000);

  return tx;
}
