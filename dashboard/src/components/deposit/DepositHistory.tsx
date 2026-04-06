import type { DepositHistoryEntry } from '../../types';
import { formatCkbAmount } from '../../hooks/useDeposit';

interface DepositHistoryProps {
  history: DepositHistoryEntry[];
}

/** Truncate a hex hash for display. */
function truncateHash(hash: string, prefixLen = 8, suffixLen = 4): string {
  if (hash.length <= prefixLen + suffixLen + 2) return hash;
  return `${hash.slice(0, prefixLen)}...${hash.slice(-suffixLen)}`;
}

export default function DepositHistory({ history }: DepositHistoryProps) {
  if (history.length === 0) {
    return (
      <div className="bg-surface-container-low p-8 rounded-xl">
        <h3 className="text-lg font-headline font-semibold text-on-surface mb-4">
          Deposit History
        </h3>
        <div className="flex flex-col items-center justify-center py-8 text-on-surface-variant/60">
          <span className="material-symbols-outlined text-3xl mb-3">database</span>
          <p className="text-sm text-on-surface-variant">
            Deposit history will be available once the indexer is deployed.
          </p>
          <p className="text-xs text-on-surface-variant/60 mt-1">
            Transactions can be viewed on the CKB Explorer in the meantime.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-low p-8 rounded-xl">
      <h3 className="text-lg font-headline font-semibold text-on-surface mb-6">
        Deposit History
      </h3>

      <div className="space-y-2">
        {history.map((entry, i) => {
          const isDeposit = entry.type === 'deposit';
          const date = new Date(entry.timestamp);

          return (
            <div
              key={i}
              className="flex items-center justify-between p-3 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    isDeposit
                      ? 'bg-secondary/10'
                      : 'bg-surface-container-highest'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-sm ${
                      isDeposit ? 'text-secondary' : 'text-on-surface-variant'
                    }`}
                  >
                    {isDeposit ? 'south_west' : 'north_east'}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-on-surface">
                    {isDeposit ? 'Deposit' : 'Update Fee'}
                  </p>
                  <p className="text-xs text-on-surface-variant/60 font-mono">
                    Epoch {entry.epoch} &middot; {truncateHash(entry.txHash)}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p
                  className={`text-sm font-mono font-semibold ${
                    isDeposit ? 'text-secondary' : 'text-on-surface-variant'
                  }`}
                >
                  {isDeposit ? '+' : '-'}
                  {formatCkbAmount(entry.amount)} CKB
                </p>
                <p className="text-xs text-on-surface-variant/60">
                  {date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
