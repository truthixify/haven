import { useState, useEffect, useCallback } from 'react';
import { ccc, useSigner } from '@ckb-ccc/connector-react';
import {
  parseScoreCell,
  SCORE_CELL_SIZE,
  HAVEN_TYPE_SCRIPT_CODE_HASH,
  HAVEN_TYPE_SCRIPT_HASH_TYPE,
} from '@haven-protocol/ckb-sdk';
import type { HavenScore } from '@haven-protocol/ckb-sdk';
import type { ScoreHistoryPoint } from '../types';
import { config } from '../config';

interface UseHavenScoreReturn {
  score: HavenScore | null;
  hasScore: boolean;
  history: ScoreHistoryPoint[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Check whether the Haven type script has been deployed on-chain.
 */
function isTypeScriptDeployed(): boolean {
  const codeHash = config.havenTypeScriptCodeHash || HAVEN_TYPE_SCRIPT_CODE_HASH;
  const clean = codeHash.replace(/^0x/, '');
  return !/^0+$/.test(clean) && !/^0+1$/.test(clean);
}

/**
 * Fetch the user's Haven Score from CKB.
 *
 * When the type script is deployed, searches by type script.
 * When not deployed (local dev), searches by lock script for cells with
 * exactly 127 bytes of data (the Haven Score cell size).
 */
export function useHavenScore(): UseHavenScoreReturn {
  const signer = useSigner();
  const [score, setScore] = useState<HavenScore | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  const refresh = useCallback(() => setFetchCount((c) => c + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function fetchScore() {
      if (!signer) {
        setScore(null);
        return;
      }

      // Only show loading spinner on initial fetch, not on background refreshes
      if (fetchCount === 0) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const addressObj = await signer.getRecommendedAddressObj();
        const userLockScript = addressObj.script;
        const client = signer.client;

        // Derive user blake160 from lock args (same logic as useDeposit)
        const argsClean = userLockScript.args.replace(/^0x/, '');
        let userBlake160 = userLockScript.args;
        if (argsClean.length > 40) {
          userBlake160 = '0x' + argsClean.substring(2, 42);
        }

        // Haven lock args = user_blake160 + tee_blake160
        const teePubkeyHash = config.teePubkeyHash.replace(/^0x/, '');
        const havenLockArgs = '0x' + userBlake160.replace(/^0x/, '') + teePubkeyHash;

        let cellData: Uint8Array | null = null;

        if (isTypeScriptDeployed()) {
          // Search by Haven lock script (the score cell's lock)
          const havenLock = ccc.Script.from({
            codeHash: config.havenLockScriptCodeHash,
            hashType: config.havenLockScriptHashType,
            args: havenLockArgs,
          });
          const collector = client.findCellsByLock(havenLock, null, true);
          for await (const cell of collector) {
            const hex = String(cell.outputData);
            const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
            if (clean.length / 2 === SCORE_CELL_SIZE) {
              cellData = new Uint8Array(clean.length / 2);
              for (let i = 0; i < clean.length; i += 2) {
                cellData[i / 2] = parseInt(clean.substring(i, i + 2), 16);
              }
              break;
            }
          }

          // Only search by current Haven lock — no type script fallback.
          // Old score cells from previous lock deployments are ignored.
        } else {
          // Type script not deployed — search by lock for 127-byte cells
          const collector = signer.findCells(
            { script: userLockScript, scriptType: 'lock', withData: true },
            true,
          );
          for await (const cell of collector) {
            const hex = String(cell.outputData);
            const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
            if (clean.length / 2 === SCORE_CELL_SIZE) {
              cellData = new Uint8Array(clean.length / 2);
              for (let i = 0; i < clean.length; i += 2) {
                cellData[i / 2] = parseInt(clean.substring(i, i + 2), 16);
              }
              break;
            }
          }
        }

        if (!cancelled) {
          if (cellData) {
            const parsed = parseScoreCell(cellData);
            setScore(parsed);
          } else {
            setScore(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch score');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchScore();
    return () => {
      cancelled = true;
    };
  }, [signer, fetchCount]);

  return {
    score,
    hasScore: score !== null,
    history: [],
    isLoading,
    error,
    refresh,
  };
}
