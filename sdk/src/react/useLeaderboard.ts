/**
 * useLeaderboard — React hook for fetching the Haven leaderboard.
 *
 * Fetches all Haven Score cells from CKB, sorts by score descending,
 * and returns the top entries. Supports auto-refresh on a configurable
 * interval.
 *
 * Usage:
 * ```tsx
 * import { useLeaderboard } from '@haven-protocol/ckb-sdk/react';
 *
 * function Leaderboard() {
 *   const { entries, loading, error } = useLeaderboard(50);
 *
 *   if (loading) return <div>Loading leaderboard...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *
 *   return (
 *     <table>
 *       <thead>
 *         <tr><th>Rank</th><th>Identity</th><th>Score</th><th>Tier</th></tr>
 *       </thead>
 *       <tbody>
 *         {entries.map((entry, i) => (
 *           <tr key={entry.identityCommitment}>
 *             <td>{i + 1}</td>
 *             <td>{entry.identityCommitment.slice(0, 10)}...</td>
 *             <td>{entry.score}</td>
 *             <td>{entry.tier}</td>
 *           </tr>
 *         ))}
 *       </tbody>
 *     </table>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { LeaderboardEntry } from '../types';
import { useHavenClient } from './provider';

export interface UseLeaderboardOptions {
  /** Maximum number of entries to return. Defaults to 100. */
  limit?: number;
  /** Auto-refresh interval in milliseconds. 0 or undefined to disable. Defaults to 60000 (60s). */
  refreshInterval?: number;
}

export interface UseLeaderboardResult {
  /** Leaderboard entries sorted by score descending. */
  entries: LeaderboardEntry[];
  /** True while the leaderboard is being fetched. */
  loading: boolean;
  /** Error object if the fetch failed. */
  error: Error | null;
  /** Manually re-fetch the leaderboard. */
  refetch: () => void;
}

/**
 * React hook for fetching the Haven leaderboard.
 *
 * @param limitOrOptions - Either a number (limit) or an options object
 *                         with limit and refreshInterval.
 * @returns Leaderboard entries, loading state, error, and refetch function.
 */
export function useLeaderboard(
  limitOrOptions?: number | UseLeaderboardOptions,
): UseLeaderboardResult {
  const client = useHavenClient();

  // Normalize options
  const limit =
    typeof limitOrOptions === 'number'
      ? limitOrOptions
      : limitOrOptions?.limit ?? 100;
  const refreshInterval =
    typeof limitOrOptions === 'object' ? limitOrOptions.refreshInterval ?? 60000 : 60000;

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [fetchKey, setFetchKey] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refetch = useCallback(() => {
    setFetchKey((k) => k + 1);
  }, []);

  // Fetch leaderboard data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    client
      .getLeaderboard(limit)
      .then((result) => {
        if (!cancelled) {
          setEntries(result);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setEntries([]);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, limit, fetchKey]);

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval > 0) {
      intervalRef.current = setInterval(() => {
        setFetchKey((k) => k + 1);
      }, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [refreshInterval]);

  return { entries, loading, error, refetch };
}
