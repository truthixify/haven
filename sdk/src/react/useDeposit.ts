/**
 * useDeposit — React hook for Haven deposit management.
 *
 * Provides deposit top-up functionality with loading/error state.
 *
 * Usage:
 * ```tsx
 * import { useDeposit } from '@haven-protocol/ckb-sdk/react';
 *
 * function DepositPanel({ outpoint }) {
 *   const { topUp, isTopUpLoading, topUpError } = useDeposit(outpoint);
 *
 *   const handleTopUp = async () => {
 *     const txHash = await topUp(BigInt(500_0000_0000)); // 500 CKB
 *     if (txHash) console.log('Top-up tx:', txHash);
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleTopUp} disabled={isTopUpLoading}>
 *         {isTopUpLoading ? 'Processing...' : 'Top Up'}
 *       </button>
 *       {topUpError && <p>Error: {topUpError}</p>}
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useCallback } from 'react';
import { ccc } from '@ckb-ccc/core';
import { buildDepositTopUp } from '../wallet';

export interface UseDepositOptions {
  /** CCC client instance for on-chain queries. */
  cccClient: ccc.Client;
  /** CCC signer instance for signing. */
  signer: ccc.Signer;
  /** OutPoint of the existing score cell to top up. */
  scoreCellOutpoint?: { txHash: string; index: number };
}

export interface UseDepositResult {
  /** Whether a top-up transaction is being built/submitted. */
  isTopUpLoading: boolean;
  /** Error message from the last failed top-up attempt, or null. */
  topUpError: string | null;
  /** Build, sign, and submit a deposit top-up. Returns the tx hash on success. */
  topUp: (amount: bigint) => Promise<string | null>;
}

/**
 * React hook for managing Haven Protocol deposits.
 *
 * Handles the full top-up flow: building the transaction, signing,
 * and submitting it via the CCC signer.
 *
 * @param options - Deposit hook options including client, signer, and score cell outpoint.
 * @returns Top-up action, loading state, and error state.
 */
export function useDeposit(options: UseDepositOptions): UseDepositResult {
  const { cccClient, signer, scoreCellOutpoint } = options;

  const [isTopUpLoading, setIsTopUpLoading] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);

  const topUp = useCallback(
    async (amount: bigint): Promise<string | null> => {
      if (!scoreCellOutpoint) {
        setTopUpError('No score cell outpoint provided');
        return null;
      }

      if (amount <= 0n) {
        setTopUpError('Top-up amount must be greater than zero');
        return null;
      }

      setIsTopUpLoading(true);
      setTopUpError(null);

      try {
        const tx = await buildDepositTopUp({
          cccClient,
          signer,
          scoreCellOutpoint,
          topUpAmount: amount,
        });

        const txHash = await signer.sendTransaction(tx);
        setIsTopUpLoading(false);
        return txHash;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Top-up transaction failed';
        setTopUpError(message);
        setIsTopUpLoading(false);
        return null;
      }
    },
    [cccClient, signer, scoreCellOutpoint],
  );

  return {
    isTopUpLoading,
    topUpError,
    topUp,
  };
}
