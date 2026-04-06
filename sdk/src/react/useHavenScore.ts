/**
 * useHavenScore — React hook to fetch a user's Haven Score.
 *
 * Usage:
 * ```tsx
 * import { useHavenScore } from '@haven-protocol/ckb-sdk/react';
 *
 * function ScoreDisplay({ lockHash }: { lockHash: string }) {
 *   const { score, loading, error } = useHavenScore(lockHash);
 *
 *   if (loading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   if (!score) return <div>No score found</div>;
 *
 *   return (
 *     <div>
 *       <p>Score: {score.score}</p>
 *       <p>Tier: {score.tier}</p>
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import type { HavenScore } from '../types';
import { useHavenClient } from './provider';

export interface UseHavenScoreResult {
  /** The parsed HavenScore, or null if not found or still loading. */
  score: HavenScore | null;
  /** True while the score is being fetched. */
  loading: boolean;
  /** Error object if the fetch failed. */
  error: Error | null;
  /** Manually re-fetch the score. */
  refetch: () => void;
}

/**
 * React hook to fetch a user's Haven Score from CKB.
 *
 * Automatically fetches when the lockHash changes and provides
 * loading/error state management.
 *
 * @param lockHash - User's lock script hash (hex with 0x prefix).
 *                   Pass null or undefined to skip fetching.
 * @returns Score data, loading state, error, and a refetch function.
 */
export function useHavenScore(lockHash: string | null | undefined): UseHavenScoreResult {
  const client = useHavenClient();
  const [score, setScore] = useState<HavenScore | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!lockHash) {
      setScore(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    client
      .getScore(lockHash)
      .then((result) => {
        if (!cancelled) {
          setScore(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setScore(null);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, lockHash, fetchKey]);

  return { score, loading, error, refetch };
}
