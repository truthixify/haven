import type { LeaderboardEntry } from '@haven-protocol-ckb/sdk';
import TierBadge from '../score/TierBadge';

interface LeaderboardRowProps {
  entry: LeaderboardEntry;
  rank: number;
}

/** Truncate a hex hash for display. */
function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

export default function LeaderboardRow({ entry, rank }: LeaderboardRowProps) {
  return (
    <tr className="hover:bg-surface-container-highest transition-all group">
      <td className="px-8 py-5 text-on-surface font-headline font-bold">
        {String(rank).padStart(2, '0')}
      </td>
      <td className="px-8 py-5">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-secondary" />
          <span className="font-mono text-sm text-on-surface-variant group-hover:text-primary transition-colors">
            {truncateHash(entry.identityCommitment)}_ZK_PROOF
          </span>
        </div>
      </td>
      <td className="px-8 py-5 text-center">
        <span className="text-xl font-headline font-bold text-on-surface">
          {entry.score}
        </span>
      </td>
      <td className="px-8 py-5">
        <TierBadge tier={entry.tier} size="sm" />
      </td>
      <td className="px-8 py-5 text-right font-mono text-[10px] text-on-surface-variant">
        Epoch {entry.epoch}
      </td>
    </tr>
  );
}
