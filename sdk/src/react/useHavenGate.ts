/**
 * useHavenGate — React hook for score threshold gating.
 *
 * Determines whether a user meets a minimum Haven Score threshold.
 * Useful for conditionally rendering features or UI sections based
 * on reputation level.
 *
 * Usage:
 * ```tsx
 * import { useHavenGate } from '@haven-protocol/ckb-sdk/react';
 *
 * function GatedFeature({ lockHash }: { lockHash: string }) {
 *   const { allowed, score, loading, error } = useHavenGate(lockHash, 650);
 *
 *   if (loading) return <div>Checking reputation...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *
 *   if (!allowed) {
 *     return <div>Guardian tier required (score >= 650). Your score: {score?.score ?? 'N/A'}</div>;
 *   }
 *
 *   return <div>Welcome, Guardian! Here is the exclusive content.</div>;
 * }
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import type { HavenScore } from '../types';
import { useHavenClient } from './provider';

export interface UseHavenGateResult {
  /** Whether the user meets the score threshold and their score is not expired. */
  allowed: boolean;
  /** The user's parsed HavenScore, or null if not found. */
  score: HavenScore | null;
  /** True while the score is being fetched and verified. */
  loading: boolean;
  /** Error object if the fetch failed. */
  error: Error | null;
  /** Manually re-check the gate. */
  refetch: () => void;
}

/**
 * React hook for Haven Score threshold gating.
 *
 * Fetches the user's score and checks whether it meets the minimum
 * threshold. The score must also be non-expired to pass.
 *
 * @param lockHash - User's lock script hash. Pass null/undefined to skip.
 * @param minScore - Minimum score required (0-1000).
 * @returns Gate result with allowed status, score data, loading, and error.
 */
export function useHavenGate(
  lockHash: string | null | undefined,
  minScore: number,
): UseHavenGateResult {
  const client = useHavenClient();
  const [score, setScore] = useState<HavenScore | null>(null);
  const [allowed, setAllowed] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!lockHash) {
      setScore(null);
      setAllowed(false);
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
          if (result && result.isValid && result.score >= minScore) {
            setAllowed(true);
          } else {
            setAllowed(false);
          }
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setScore(null);
          setAllowed(false);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, lockHash, minScore, fetchKey]);

  return { allowed, score, loading, error, refetch };
}
