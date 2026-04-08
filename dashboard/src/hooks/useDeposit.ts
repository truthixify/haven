import { useState, useCallback } from 'react';
import { ccc, useSigner } from '@ckb-ccc/connector-react';
import {
  DEFAULT_MIN_DEPOSIT,
  DEFAULT_PER_UPDATE_FEE,
  HAVEN_TYPE_SCRIPT_CODE_HASH,
  HAVEN_TYPE_SCRIPT_HASH_TYPE,
  SCORE_CELL_SIZE,
  serializeScoreCell,
} from '@haven-protocol-ckb/sdk';
import { HavenTeeClient } from '@haven-protocol-ckb/sdk/tee';
import type { DepositHistoryEntry } from '../types';
import { config } from '../config';

const teeClient = new HavenTeeClient(config.teeEndpoint);

const SHANNON_PER_CKB = BigInt(100_000_000);

/**
 * Poll CKB RPC until a transaction is committed on-chain.
 * Checks every 3 seconds, times out after 2 minutes.
 */
async function waitForConfirmation(
  client: ccc.Client,
  txHash: string,
  maxAttempts = 40,
  intervalMs = 3000,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    try {
      const tx = await client.getTransaction(txHash);
      if (tx && tx.status === 'committed') return;
    } catch {
      // RPC error — keep polling
    }
  }
  // Timeout — tx may still confirm later, don't throw
}

function formatCKB(shannon: bigint): string {
  const ckb = Number(shannon) / Number(SHANNON_PER_CKB);
  if (ckb >= 1_000_000) return (ckb / 1_000_000).toFixed(2) + 'M';
  if (ckb >= 1_000) return (ckb / 1_000).toFixed(2) + 'K';
  return ckb.toFixed(2);
}

/** Estimate how many score updates can be paid from a deposit. */
export function estimateUpdatesRemaining(
  depositShannon: bigint,
  feePerUpdate: bigint = DEFAULT_PER_UPDATE_FEE,
): number {
  if (feePerUpdate === 0n) return 0;
  return Number(depositShannon / feePerUpdate);
}

/** Check whether the deposit balance is low. */
export function isLowBalance(depositShannon: bigint): boolean {
  return depositShannon < BigInt(20) * SHANNON_PER_CKB;
}

/** Format CKB amount from shannons for display. */
export function formatCkbAmount(shannon: bigint): string {
  return formatCKB(shannon);
}

/**
 * Resolve the Haven type script code hash — prefer env config, fall back to SDK constant.
 * Returns null if the type script hasn't been deployed yet (placeholder value).
 */
function getTypeScriptInfo(): {
  codeHash: string;
  hashType: string;
  cellDepTxHash: string;
  cellDepIndex: number;
} | null {
  const codeHash = config.havenTypeScriptCodeHash || HAVEN_TYPE_SCRIPT_CODE_HASH;
  const clean = codeHash.replace(/^0x/, '');
  if (/^0+$/.test(clean) || /^0+1$/.test(clean)) {
    return null;
  }
  return {
    codeHash,
    hashType: config.havenTypeScriptHashType || HAVEN_TYPE_SCRIPT_HASH_TYPE,
    cellDepTxHash: config.havenTypeScriptCellDepTxHash,
    cellDepIndex: config.havenTypeScriptCellDepIndex,
  };
}

interface UseDepositReturn {
  isLoading: boolean;
  error: string | null;
  lastTxHash: string | null;
  depositHistory: DepositHistoryEntry[];
  createScoreCell: (depositAmountCKB: number) => Promise<string | null>;
  topUp: (amountCKB: number) => Promise<string | null>;
  clearError: () => void;
}

/**
 * Deposit management hook.
 *
 * Provides two actions:
 * - createScoreCell: Build a CKB tx that creates a new Haven Score cell
 *   with initial deposit.
 * - topUp: Find the user's existing score cell on-chain and increase its
 *   deposit_balance.
 */
export function useDeposit(): UseDepositReturn {
  const signer = useSigner();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [depositHistory] = useState<DepositHistoryEntry[]>([]);

  const minDepositCKB = Number(DEFAULT_MIN_DEPOSIT) / Number(SHANNON_PER_CKB);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Create a brand new Haven Score cell for a first-time user.
   *
   * Builds a CKB tx with one output: the score cell containing 127 bytes
   * of initial data (version=1, score=0, epoch=0, deposit_balance set to
   * the deposited shannons).
   */
  const createScoreCell = useCallback(
    async (depositAmountCKB: number): Promise<string | null> => {
      if (!signer) {
        setError('Wallet not connected');
        return null;
      }

      if (depositAmountCKB < minDepositCKB) {
        setError(`Minimum deposit is ${minDepositCKB} CKB`);
        return null;
      }

      setIsLoading(true);
      setError(null);
      setLastTxHash(null);

      try {
        const addressObj = await signer.getRecommendedAddressObj();
        const userLockScript = addressObj.script;
        const userLockArgs = userLockScript.args;

        // Derive user's blake160 pubkey hash (20 bytes) for the Haven lock args
        // For secp256k1: lock args IS the blake160
        // For omnilock/JoyID: extract the first 20 bytes from lock args
        let userBlake160 = userLockArgs;
        const argsClean = userLockArgs.replace(/^0x/, '');
        if (argsClean.length > 40) {
          // Omnilock args are longer — extract the 20-byte auth content
          // Format: flags(1) + blake160(20) + ... so bytes 1-21 (hex chars 2-42)
          userBlake160 = '0x' + argsClean.substring(2, 42);
        }

        const depositShannons = BigInt(Math.floor(depositAmountCKB * 1e8));

        // Build Haven lock script args: user_pubkey_hash(20) | tee_pubkey_hash(20)
        const teePubkeyHash = config.teePubkeyHash.replace(/^0x/, '');
        const userHash = userBlake160.replace(/^0x/, '');
        const havenLockArgs = '0x' + userHash + teePubkeyHash;

        // Build the Haven dual-path lock script
        const havenLock = {
          codeHash: config.havenLockScriptCodeHash,
          hashType: config.havenLockScriptHashType,
          args: havenLockArgs,
        };

        // User identity = the TEE identity commitment (blake2b of pubkey)
        // Must match what the TEE puts in SP1 public inputs
        const identity = await signer.getIdentity();
        const { identityCommitment: userIdentityCommitment } = await teeClient.getCommitment(identity);
        const identityHex = '0x' + userIdentityCommitment.replace(/^0x/, '').padEnd(64, '0');

        // Build the initial 127-byte score cell data
        const initialData = serializeScoreCell({
          version: 1,
          score: 0,
          epoch: 0,
          userIdentity: identityHex,
          programHash: '0x' + '00'.repeat(32),
          proofHash: '0x' + '00'.repeat(32),
          breakdown: { privacy: 0, contribution: 0, humanity: 0, community: 0 },
          issuedAt: 0,
          expiresAt: 0,
          depositBalance: depositShannons,
        });

        const dataHex =
          '0x' +
          Array.from(initialData)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');

        // Build output cell with Haven lock + type script
        const typeInfo = getTypeScriptInfo();

        const outputCell: Record<string, unknown> = { lock: havenLock };
        const cellDeps: Array<Record<string, unknown>> = [];

        // Cell dep for the Haven lock script binary
        cellDeps.push({
          outPoint: {
            txHash: config.havenLockScriptCellDepTxHash,
            index: config.havenLockScriptCellDepIndex,
          },
          depType: 'code',
        });

        if (typeInfo) {
          outputCell.type = {
            codeHash: typeInfo.codeHash,
            hashType: typeInfo.hashType,
            args: havenLockArgs,
          };
          // Cell dep for the type script binary
          cellDeps.push({
            outPoint: {
              txHash: typeInfo.cellDepTxHash,
              index: typeInfo.cellDepIndex,
            },
            depType: 'code',
          });
          // Cell dep for the registry cell
          cellDeps.push({
            outPoint: {
              txHash: config.havenRegistryCellDepTxHash,
              index: config.havenRegistryCellDepIndex,
            },
            depType: 'code',
          });
        }

        const tx = ccc.Transaction.from({
          cellDeps,
          outputs: [outputCell],
          outputsData: [dataHex],
        });

        // User pays for cell creation from their wallet
        await tx.completeInputsByCapacity(signer);
        await tx.completeFeeBy(signer, 1000);
        const txHash = await signer.sendTransaction(tx);

        setLastTxHash(txHash);

        // Wait for tx confirmation on-chain
        await waitForConfirmation(signer.client, txHash);

        // Save the score cell outpoint to the TEE so it can update the score later
        try {
          const addr = (await signer.getRecommendedAddressObj()).toString();
          const identity = localStorage.getItem(`haven_identity_${addr}`);
          if (identity) {
            console.log('[Haven] Saving score cell outpoint:', identity.substring(0, 16), txHash);
            await teeClient.saveScoreCellOutpoint(identity, txHash, 0);
          } else {
            console.warn('[Haven] No identity in localStorage — register identity first');
          }
        } catch (err) {
          console.error('[Haven] Failed to save outpoint:', err);
        }

        setIsLoading(false);
        return txHash;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to create score cell';
        setError(message);
        setIsLoading(false);
        return null;
      }
    },
    [signer, minDepositCKB],
  );

  /**
   * Top up an existing score cell's deposit balance.
   *
   * Finds the user's score cell on-chain, consumes it as input, and
   * creates a new output with the deposit_balance increased.
   */
  const topUp = useCallback(
    async (amountCKB: number): Promise<string | null> => {
      if (!signer) {
        setError('Wallet not connected');
        return null;
      }

      if (amountCKB <= 0) {
        setError('Top-up amount must be greater than zero');
        return null;
      }

      setIsLoading(true);
      setError(null);
      setLastTxHash(null);

      try {
        const addressObj = await signer.getRecommendedAddressObj();
        const lockScript = addressObj.script;
        const lockHash = lockScript.hash();

        const typeInfo = getTypeScriptInfo();

        // Find the existing score cell on-chain
        const signerClient = signer.client;
        let scoreCell: {
          outPoint: ccc.OutPoint;
          cellOutput: ccc.CellOutput;
          outputData: string;
        } | null = null;

        if (typeInfo) {
          // Search by type script when deployed
          const typeScript = ccc.Script.from({
            codeHash: typeInfo.codeHash,
            hashType: typeInfo.hashType,
            args: lockHash,
          });
          const collector = signerClient.findCellsByType(typeScript, true);
          for await (const cell of collector) {
            if (!cell.outPoint) continue;
            const dataHex = String(cell.outputData);
            const clean = dataHex.startsWith('0x') ? dataHex.slice(2) : dataHex;
            if (clean.length / 2 === SCORE_CELL_SIZE) {
              scoreCell = { outPoint: cell.outPoint, cellOutput: cell.cellOutput, outputData: dataHex };
              break;
            }
          }
        } else {
          // Type script not deployed — search by lock script for cells with 127-byte data
          const collector = signer.findCells(
            { script: lockScript, scriptType: 'lock', withData: true },
            true,
          );
          for await (const cell of collector) {
            if (!cell.outPoint) continue;
            const dataHex = String(cell.outputData);
            const clean = dataHex.startsWith('0x') ? dataHex.slice(2) : dataHex;
            if (clean.length / 2 === SCORE_CELL_SIZE) {
              scoreCell = { outPoint: cell.outPoint, cellOutput: cell.cellOutput, outputData: dataHex };
              break;
            }
          }
        }

        if (!scoreCell) {
          setError('No existing score cell found on-chain. Create one first.');
          setIsLoading(false);
          return null;
        }

        // Parse existing cell data to update deposit_balance
        const existingHex = scoreCell.outputData.startsWith('0x')
          ? scoreCell.outputData.slice(2)
          : scoreCell.outputData;
        const existingData = new Uint8Array(existingHex.length / 2);
        for (let i = 0; i < existingHex.length; i += 2) {
          existingData[i / 2] = parseInt(existingHex.substring(i, i + 2), 16);
        }

        // Read current deposit_balance (bytes 119-126, u64 LE)
        const view = new DataView(existingData.buffer);
        const currentDeposit = view.getBigUint64(119, true);
        const topUpShannons = BigInt(Math.floor(amountCKB * 1e8));
        const newDeposit = currentDeposit + topUpShannons;

        // Write updated deposit_balance
        const updatedData = new Uint8Array(existingData);
        const updatedView = new DataView(updatedData.buffer);
        updatedView.setBigUint64(119, newDeposit, true);

        const updatedDataHex =
          '0x' +
          Array.from(updatedData)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');

        // Build the transaction: consume old score cell, create new one with more capacity
        const newCapacity = scoreCell.cellOutput.capacity + topUpShannons;

        const topUpCellDeps: Array<Record<string, unknown>> = [];
        if (typeInfo) {
          topUpCellDeps.push({
            outPoint: {
              txHash: typeInfo.cellDepTxHash,
              index: typeInfo.cellDepIndex,
            },
            depType: 'code',
          });
          topUpCellDeps.push({
            outPoint: {
              txHash: config.havenRegistryCellDepTxHash,
              index: config.havenRegistryCellDepIndex,
            },
            depType: 'code',
          });
        }

        const tx = ccc.Transaction.from({
          cellDeps: topUpCellDeps,
          inputs: [{ previousOutput: scoreCell.outPoint }],
          outputs: [
            {
              capacity: newCapacity,
              lock: scoreCell.cellOutput.lock,
              type: scoreCell.cellOutput.type,
            },
          ],
          outputsData: [updatedDataHex],
        });

        await tx.completeInputsByCapacity(signer);
        await tx.completeFeeBy(signer, 1000);
        const txHash = await signer.sendTransaction(tx);

        setLastTxHash(txHash);

        // Wait for tx confirmation on-chain
        await waitForConfirmation(signer.client, txHash);

        setIsLoading(false);
        return txHash;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Top-up failed';
        setError(message);
        setIsLoading(false);
        return null;
      }
    },
    [signer],
  );

  return {
    isLoading,
    error,
    lastTxHash,
    depositHistory,
    createScoreCell,
    topUp,
    clearError,
  };
}
