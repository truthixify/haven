import { useState } from 'react';
import { useLeaderboard } from '../hooks/useLeaderboard';
import type { LeaderboardEntry } from '@haven-protocol-ckb/sdk';
import ActionLoadingOverlay from '../components/loading/ActionLoadingOverlay';

type FilterTab = 'all' | 'epoch' | 'tier';

function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

export default function Leaderboard() {
  const {
    entries,
    totalCount,
    isLoading,
    page,
    totalPages,
    setPage,
    refresh,
  } = useLeaderboard();

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  const top3 = page === 1 ? entries.slice(0, Math.min(3, entries.length)) : [];
  const tableEntries = entries;
  const tableStartRank = (page - 1) * 25 + 1;

  return (
    <>
      {/* Header */}
      <section className="mb-8 md:mb-12">
        <h2 className="text-3xl md:text-6xl font-headline font-bold text-on-surface tracking-tighter leading-none mb-3">
          Global <span className="text-primary">Leaderboard</span>
        </h2>
        <p className="text-on-surface-variant text-sm md:text-base max-w-2xl font-light">
          Public scores, private identities. Verified through TEE attestation and on-chain proofs.
        </p>
      </section>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <div className="flex bg-surface-container-low p-1 rounded-lg">
          {[
            { key: 'all' as FilterTab, label: 'All Time' },
            { key: 'epoch' as FilterTab, label: 'This Epoch' },
            { key: 'tier' as FilterTab, label: 'By Tier' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`px-3 md:px-5 py-2 rounded text-[10px] md:text-xs font-headline font-bold tracking-widest uppercase transition-all ${
                activeFilter === tab.key
                  ? 'bg-surface-container-highest text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-widest">
            {totalCount} {totalCount === 1 ? 'user' : 'users'} active
          </span>
          <button
            onClick={refresh}
            className="p-1.5 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-primary transition-all"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
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
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-4">leaderboard</span>
          <p className="text-on-surface-variant text-sm">No scores on-chain yet.</p>
          <p className="text-on-surface-variant/60 text-xs mt-1">Create a score cell to appear here.</p>
        </div>
      ) : (
        <>
          {/* Top 3 Podium */}
          {top3.length > 0 && (
            <div className={`grid gap-4 md:gap-6 mb-8 ${
              top3.length === 1 ? 'grid-cols-1 max-w-md mx-auto' :
              top3.length === 2 ? 'grid-cols-1 sm:grid-cols-2 max-w-2xl' :
              'grid-cols-1 sm:grid-cols-3'
            }`}>
              {top3.length >= 2 && <PodiumCard entry={top3[1]} rank={2} variant="silver" />}
              <PodiumCard entry={top3[0]} rank={1} variant="gold" />
              {top3.length >= 3 && <PodiumCard entry={top3[2]} rank={3} variant="bronze" />}
            </div>
          )}

          {/* Table */}
          {tableEntries.length > 0 && (
            <div className="bg-surface-container-low rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-container-high/50 text-[10px] font-headline font-bold tracking-widest uppercase text-on-surface-variant">
                    <th className="px-4 md:px-8 py-4 w-16">Rank</th>
                    <th className="px-4 md:px-8 py-4">Identity</th>
                    <th className="px-4 md:px-8 py-4 text-center">Score</th>
                    <th className="hidden sm:table-cell px-4 md:px-8 py-4">Tier</th>
                    <th className="hidden md:table-cell px-4 md:px-8 py-4 text-right">Epoch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {tableEntries.map((entry, i) => (
                    <tr key={entry.identityCommitment} className="hover:bg-surface-container-highest transition-all">
                      <td className="px-4 md:px-8 py-4 font-headline font-bold text-on-surface">
                        {String(tableStartRank + i).padStart(2, '0')}
                      </td>
                      <td className="px-4 md:px-8 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-secondary flex-shrink-0" />
                          <span className="font-mono text-xs text-on-surface-variant truncate">
                            {truncateHash(entry.identityCommitment)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 md:px-8 py-4 text-center">
                        <span className="text-lg font-headline font-bold text-on-surface">{entry.score}</span>
                      </td>
                      <td className="hidden sm:table-cell px-4 md:px-8 py-4">
                        <TierLabel tier={entry.tier} />
                      </td>
                      <td className="hidden md:table-cell px-4 md:px-8 py-4 text-right font-mono text-[10px] text-on-surface-variant">
                        {entry.epoch > 0 ? `Epoch ${entry.epoch}` : '--'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="p-2 rounded hover:text-primary transition-colors disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-sm">chevron_left</span>
              </button>
              <span className="px-4 py-2 font-mono text-xs text-on-surface-variant uppercase tracking-widest">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded hover:text-primary transition-colors disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-sm">chevron_right</span>
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function PodiumCard({ entry, rank, variant }: { entry: LeaderboardEntry; rank: number; variant: 'gold' | 'silver' | 'bronze' }) {
  const isGold = variant === 'gold';

  const bgClass = isGold
    ? 'bg-surface-container-low border-t-2 border-tertiary/40'
    : 'bg-[#1f2022] border-l-2 border-outline-variant/20';

  const icon = isGold ? 'stars' : variant === 'silver' ? 'military_tech' : 'workspace_premium';
  const rankColor = isGold ? 'text-tertiary' : 'text-on-surface-variant';
  const scoreSize = isGold ? 'text-3xl md:text-4xl' : 'text-xl md:text-2xl';

  return (
    <div className={`${bgClass} p-5 md:p-6 rounded-xl relative overflow-hidden ${isGold ? 'sm:order-none order-first' : ''}`}>
      <div className="absolute top-2 right-2 opacity-10">
        <span className={`material-symbols-outlined ${isGold ? 'text-5xl md:text-6xl' : 'text-4xl md:text-5xl'}`}
          style={isGold ? { fontVariationSettings: "'FILL' 1" } : undefined}
        >
          {icon}
        </span>
      </div>
      <span className={`text-[10px] font-headline font-bold tracking-widest ${rankColor} uppercase block mb-2`}>
        #{String(rank).padStart(2, '0')}
      </span>
      <h3 className={`${scoreSize} font-headline font-bold text-on-surface mb-1`}>{entry.score}</h3>
      <div className="font-mono text-[11px] text-on-surface-variant mb-3 truncate">
        {truncateHash(entry.identityCommitment)}
      </div>
      <TierLabel tier={entry.tier} />
    </div>
  );
}

function TierLabel({ tier }: { tier: string }) {
  const color = tier === 'Sovereign' ? 'text-tertiary border-tertiary/20 bg-tertiary/10'
    : tier === 'Guardian' ? 'text-primary border-primary/20 bg-primary/10'
    : tier === 'Trusted' ? 'text-secondary border-secondary/20 bg-secondary/10'
    : 'text-on-surface-variant border-outline-variant/20 bg-surface-container-highest';

  return (
    <span className={`inline-block px-2.5 py-0.5 text-[10px] font-headline font-bold uppercase tracking-widest rounded-full border ${color}`}>
      {tier}
    </span>
  );
}
