import type { LeaderboardEntry } from '@haven-protocol/ckb-sdk';
import type { LeaderboardSortField, SortDirection } from '../../types';
import LeaderboardRow from './LeaderboardRow';

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  totalCount: number;
  isLoading: boolean;
  page: number;
  totalPages: number;
  sortField: LeaderboardSortField;
  sortDirection: SortDirection;
  onPageChange: (page: number) => void;
  onSortChange: (field: LeaderboardSortField) => void;
  onRefresh: () => void;
}

export default function LeaderboardTable({
  entries,
  totalCount,
  isLoading,
  page,
  totalPages,
  sortField,
  sortDirection,
  onPageChange,
  onSortChange,
  onRefresh,
}: LeaderboardTableProps) {
  return (
    <div className="bg-surface-container-low rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-outline-variant/10">
        <div>
          <h2 className="text-lg font-headline font-semibold text-on-surface">
            Haven Leaderboard
          </h2>
          <p className="text-xs text-on-surface-variant">
            {totalCount} identity commitments ranked
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="text-on-surface-variant hover:text-primary transition-colors"
          title="Refresh leaderboard"
        >
          <span className={`material-symbols-outlined text-sm ${isLoading ? 'animate-spin' : ''}`}>
            refresh
          </span>
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-high/50 text-[10px] font-headline font-bold tracking-widest uppercase text-on-surface-variant">
              <th className="px-8 py-4 w-20">Rank</th>
              <th className="px-8 py-4">Identity Commitment</th>
              <th className="px-8 py-4 text-center">
                <button
                  onClick={() => onSortChange('score')}
                  className="hover:text-primary transition-colors"
                >
                  Haven Score
                  {sortField === 'score' && (
                    <span className="ml-1 text-primary">
                      {sortDirection === 'desc' ? '\u2193' : '\u2191'}
                    </span>
                  )}
                </button>
              </th>
              <th className="px-8 py-4">Tier</th>
              <th className="px-8 py-4 text-right">Last Update</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {isLoading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="py-5 px-8">
                      <div className="h-6 bg-surface-container-high/30 rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              : entries.map((entry, i) => (
                  <LeaderboardRow
                    key={entry.identityCommitment}
                    entry={entry}
                    rank={(page - 1) * 25 + i + 1}
                  />
                ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2 p-4">
          <button
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="p-2 glass-panel rounded hover:text-primary transition-colors disabled:opacity-30"
          >
            <span className="material-symbols-outlined text-sm">chevron_left</span>
          </button>
          <span className="px-4 py-2 font-mono text-xs text-on-surface-variant uppercase tracking-widest">
            Page {String(page).padStart(2, '0')} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="p-2 glass-panel rounded hover:text-primary transition-colors disabled:opacity-30"
          >
            <span className="material-symbols-outlined text-sm">chevron_right</span>
          </button>
        </div>
      )}
    </div>
  );
}
