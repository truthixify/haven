import { useState, useCallback, useMemo } from 'react';
import { useLeaderboard as useSdkLeaderboard } from '@haven-protocol/ckb-sdk/react';
import type { LeaderboardEntry } from '@haven-protocol/ckb-sdk';
import type { LeaderboardSortField, SortDirection } from '../types';

const PAGE_SIZE = 25;

interface UseLeaderboardReturn {
  entries: LeaderboardEntry[];
  totalCount: number;
  isLoading: boolean;
  error: string | null;
  page: number;
  totalPages: number;
  sortField: LeaderboardSortField;
  sortDirection: SortDirection;
  setPage: (page: number) => void;
  setSortField: (field: LeaderboardSortField) => void;
  refresh: () => void;
}

/**
 * Thin wrapper around the SDK's useLeaderboard hook.
 * Adds dashboard-specific pagination and sorting.
 * Returns real on-chain data only — no demo fallback.
 */
export function useLeaderboard(): UseLeaderboardReturn {
  const { entries: sdkEntries, loading, error, refetch } = useSdkLeaderboard({
    limit: 500,
    refreshInterval: 0,
  });

  const [page, setPage] = useState(1);
  const [sortField, setSortFieldState] = useState<LeaderboardSortField>('score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Use SDK data directly — no demo fallback
  const allEntries = useMemo(() => {
    return sdkEntries;
  }, [sdkEntries]);

  // Apply sorting
  const sortedEntries = useMemo(() => {
    const sorted = [...allEntries].sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortField) {
        case 'privacy':
          aVal = a.breakdown.privacy;
          bVal = b.breakdown.privacy;
          break;
        case 'contribution':
          aVal = a.breakdown.contribution;
          bVal = b.breakdown.contribution;
          break;
        case 'humanity':
          aVal = a.breakdown.humanity;
          bVal = b.breakdown.humanity;
          break;
        case 'community':
          aVal = a.breakdown.community;
          bVal = b.breakdown.community;
          break;
        default:
          aVal = a.score;
          bVal = b.score;
      }
      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal;
    });
    return sorted;
  }, [allEntries, sortField, sortDirection]);

  // Paginate
  const totalPages = Math.ceil(sortedEntries.length / PAGE_SIZE);
  const paginatedEntries = useMemo(
    () => sortedEntries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sortedEntries, page],
  );

  const handleSetSortField = useCallback(
    (field: LeaderboardSortField) => {
      if (field === sortField) {
        setSortDirection((d) => (d === 'desc' ? 'asc' : 'desc'));
      } else {
        setSortFieldState(field);
        setSortDirection('desc');
      }
      setPage(1);
    },
    [sortField],
  );

  return {
    entries: paginatedEntries,
    totalCount: allEntries.length,
    isLoading: loading,
    error: error?.message ?? null,
    page,
    totalPages,
    sortField,
    sortDirection,
    setPage,
    setSortField: handleSetSortField,
    refresh: refetch,
  };
}
