import { useState } from 'react';
import { useLeaderboard } from '../hooks/useLeaderboard';
import type { LeaderboardEntry } from '@haven-protocol/ckb-sdk';
import ActionLoadingOverlay from '../components/loading/ActionLoadingOverlay';

type FilterTab = 'all' | 'epoch' | 'tier';

/** Truncate a hex hash for display. */
function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

export default function Leaderboard() {
  const {
    entries,
    totalCount,
    isLoading,
    page,
    totalPages,
    setPage,
  } = useLeaderboard();

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  // Build top 3 from first page when available
  const allEntries = entries;
  const top3 = page === 1 ? allEntries.slice(0, 3) : [];
  const tableEntries = page === 1 ? allEntries.slice(3) : allEntries;
  const tableStartRank = page === 1 ? 4 : (page - 1) * 25 + 1;

  return (
    <>
      {/* Header Section — matches stitch leaderboard HTML */}
      <section className="mb-12 max-w-5xl">
        <h2 className="text-4xl md:text-6xl font-headline font-bold text-on-surface tracking-tighter leading-none mb-4">
          Global <span className="text-primary">Leaderboard</span>
        </h2>
        <p className="text-on-surface-variant text-base md:text-lg max-w-2xl font-light">
          Securely verifying reputation through cryptographic zero-knowledge
          proofs.{' '}
          <span className="text-secondary font-medium">
            Public scores, private identities.
          </span>
        </p>
      </section>

      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 max-w-7xl gap-4">
        <div className="flex bg-surface-container-low p-1 rounded-lg">
          {[
            { key: 'all' as FilterTab, label: 'All Time' },
            { key: 'epoch' as FilterTab, label: 'This Epoch' },
            { key: 'tier' as FilterTab, label: 'By Tier' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`px-4 md:px-6 py-2 rounded text-xs font-headline font-bold tracking-widest uppercase transition-all ${
                activeFilter === tab.key
                  ? 'bg-surface-container-highest text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-widest">
            Protocol Stats: {totalCount.toLocaleString()} Users Active
          </span>
          <div className="hidden md:block h-4 w-px bg-outline-variant/30" />
          <button className="hidden md:flex items-center gap-2 px-4 py-2 bg-surface-container-highest rounded border border-outline-variant/20 hover:border-primary/50 transition-all">
            <span className="material-symbols-outlined text-sm">
              filter_list
            </span>
            <span className="text-xs font-headline font-bold tracking-widest uppercase">
              Advanced Filters
            </span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <ActionLoadingOverlay
          isOpen={true}
          title="Loading Global Leaderboard"
          description="Querying all Haven Score cells from the CKB network."
          steps={[
            { label: 'Connecting to CKB Indexer', status: 'verified' },
            { label: 'Fetching Score Cells', status: 'processing' },
          ]}
        />
      ) : (
        <>
          {/* Leaderboard Grid — Bento Style Headers for Top 3 */}
          {top3.length >= 3 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 max-w-7xl">
              {/* Rank 2 */}
              <PodiumCard entry={top3[1]} rank={2} variant="silver" />
              {/* Rank 1 */}
              <PodiumCard entry={top3[0]} rank={1} variant="gold" />
              {/* Rank 3 */}
              <PodiumCard entry={top3[2]} rank={3} variant="bronze" />
            </div>
          )}

          {/* Main Table */}
          <div className="max-w-7xl">
            <div className="bg-surface-container-low rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-high/50 text-[10px] font-headline font-bold tracking-widest uppercase text-on-surface-variant">
                    <th className="px-3 md:px-8 py-4 w-12 md:w-20">Rank</th>
                    <th className="px-3 md:px-8 py-4">
                      Identity
                    </th>
                    <th className="px-3 md:px-8 py-4 text-center">
                      Score
                    </th>
                    <th className="hidden sm:table-cell px-4 md:px-8 py-4">Tier</th>
                    <th className="hidden md:table-cell px-4 md:px-8 py-4 text-right">
                      Last Update
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {tableEntries.map((entry, i) => {
                    const rank = tableStartRank + i;
                    const isCurrentUser = false;

                    return (
                      <tr
                        key={entry.identityCommitment}
                        className={`transition-all group ${
                          isCurrentUser
                            ? 'bg-primary/5 border-y border-primary/20 hover:bg-primary/10'
                            : 'hover:bg-surface-container-highest'
                        }`}
                      >
                        <td
                          className={`px-3 md:px-8 py-4 md:py-5 font-headline font-bold ${
                            isCurrentUser
                              ? 'text-primary italic'
                              : 'text-on-surface'
                          }`}
                        >
                          {String(rank).padStart(2, '0')}
                        </td>
                        <td className="px-3 md:px-8 py-4 md:py-5">
                          <div className="flex items-center gap-2 md:gap-3">
                            <div
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                isCurrentUser
                                  ? 'bg-primary shadow-[0_0_8px_#d0bcff]'
                                  : 'bg-secondary'
                              }`}
                            />
                            <span
                              className={`font-mono text-xs md:text-sm transition-colors truncate ${
                                isCurrentUser
                                  ? 'text-primary font-bold'
                                  : 'text-on-surface-variant group-hover:text-primary'
                              }`}
                            >
                              {isCurrentUser
                                ? `YOU (${truncateHash(entry.identityCommitment)})`
                                : truncateHash(entry.identityCommitment)}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 md:px-8 py-4 md:py-5 text-center">
                          <span
                            className={`text-base md:text-xl font-headline font-bold ${
                              isCurrentUser
                                ? 'text-primary'
                                : 'text-on-surface'
                            }`}
                          >
                            {entry.score}
                          </span>
                        </td>
                        <td className="hidden sm:table-cell px-4 md:px-8 py-4 md:py-5">
                          <span
                            className={`text-[10px] font-headline font-bold uppercase tracking-widest ${
                              isCurrentUser
                                ? 'text-primary'
                                : entry.tier === 'Sovereign'
                                  ? 'text-tertiary'
                                  : entry.tier === 'Guardian'
                                    ? 'text-primary'
                                    : 'text-on-surface-variant'
                            }`}
                          >
                            {entry.tier}
                          </span>
                        </td>
                        <td
                          className={`hidden md:table-cell px-4 md:px-8 py-4 md:py-5 text-right font-mono text-[10px] ${
                            isCurrentUser
                              ? 'text-primary'
                              : 'text-on-surface-variant'
                          }`}
                        >
                          {isCurrentUser ? 'Active Now' : '--'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="p-2 glass-panel rounded hover:text-primary transition-colors disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-sm">
                    chevron_left
                  </span>
                </button>
                <span className="px-4 py-2 font-mono text-xs text-on-surface-variant uppercase tracking-widest">
                  Page {String(page).padStart(2, '0')} of {totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages}
                  className="p-2 glass-panel rounded hover:text-primary transition-colors disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-sm">
                    chevron_right
                  </span>
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

/** Podium card for top 3 — matches stitch leaderboard HTML exactly */
function PodiumCard({
  entry,
  rank,
  variant,
}: {
  entry: LeaderboardEntry;
  rank: number;
  variant: 'gold' | 'silver' | 'bronze';
}) {
  const isGold = variant === 'gold';
  const isSilver = variant === 'silver';

  const glowClass =
    variant === 'gold'
      ? 'gold-glow'
      : variant === 'silver'
        ? 'silver-glow'
        : 'bronze-glow';

  const borderClass = isGold
    ? 'border-t-2 border-tertiary/50'
    : isSilver
      ? 'border-l-2 border-on-surface-variant/30'
      : 'border-l-2 border-tertiary-container/30';

  const scaleClass = isGold ? 'scale-105 z-10' : '';
  const paddingClass = isGold ? 'p-8' : 'p-6';

  const rankLabel = isGold
    ? `Rank ${String(rank).padStart(2, '0')} \u2014 Sovereign Alpha`
    : `Rank ${String(rank).padStart(2, '0')}`;

  const rankColor = isGold
    ? 'text-tertiary'
    : isSilver
      ? 'text-[#cbc3d7]'
      : 'text-tertiary-container';

  const icon = isGold
    ? 'stars'
    : isSilver
      ? 'military_tech'
      : 'workspace_premium';

  const iconWrapClass = isGold ? 'text-tertiary/20' : 'opacity-10';

  const iconSize = isGold ? 'text-7xl' : 'text-6xl';

  const scoreSize = isGold ? 'text-4xl' : 'text-2xl';

  const identityColor = isGold ? 'text-primary' : 'text-on-surface-variant';
  const identitySize = isGold ? 'text-xs' : 'text-[11px]';
  const identityMargin = isGold ? 'mb-6' : 'mb-4';

  return (
    <div
      className={`glass-panel ${paddingClass} rounded-xl relative overflow-hidden ${borderClass} ${glowClass} ${scaleClass}`}
    >
      <div className={`absolute top-0 right-0 p-4 ${iconWrapClass}`}>
        <span
          className={`material-symbols-outlined ${iconSize}`}
          style={
            isGold ? { fontVariationSettings: "'FILL' 1" } : undefined
          }
        >
          {icon}
        </span>
      </div>
      <span
        className={`text-[10px] font-headline font-bold tracking-widest ${rankColor} uppercase block mb-1`}
      >
        {rankLabel}
      </span>
      <h3
        className={`${scoreSize} font-headline font-bold text-on-surface mb-2`}
      >
        {entry.score} Score
      </h3>
      <div
        className={`font-mono ${identitySize} ${identityColor} ${identityMargin} truncate`}
      >
        {truncateHash(entry.identityCommitment)}
        {isGold ? '_COMMITMENT' : ''}
      </div>
      <div className="flex items-center justify-between">
        {isGold ? (
          <span className="px-4 py-1.5 bg-tertiary/10 text-tertiary text-[10px] font-extrabold rounded-full uppercase tracking-widest border border-tertiary/20">
            {entry.tier} Tier
          </span>
        ) : (
          <span className="px-3 py-1 bg-surface-container-highest text-secondary text-[10px] font-bold rounded-full uppercase tracking-tighter">
            {entry.tier} Tier
          </span>
        )}
        <span className="text-[10px] font-mono text-on-surface-variant">
          Updated {Math.floor(Math.random() * 15) + 1}m ago
        </span>
      </div>
    </div>
  );
}
