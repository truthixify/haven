import { useState } from 'react';
import { DEFAULT_MIN_DEPOSIT, DEFAULT_PER_UPDATE_FEE } from '@haven-protocol-ckb/sdk';
import { estimateUpdatesRemaining, isLowBalance, formatCkbAmount } from '../../hooks/useDeposit';

const SHANNON_PER_CKB = BigInt(100_000_000);

interface DepositCardProps {
  /** Current deposit balance in shannons. Null if no score cell exists yet. */
  depositBalance: bigint | null;
  /** Create a new score cell with initial deposit. */
  onCreateScoreCell: (amountCKB: number) => Promise<string | null>;
  /** Top up an existing score cell. */
  onTopUp: (amountCKB: number) => Promise<string | null>;
  /** Whether a transaction is in progress. */
  isLoading: boolean;
  /** Error from the last operation. */
  error: string | null;
  /** Last successful transaction hash. */
  lastTxHash: string | null;
  /** Clear the current error. */
  onClearError: () => void;
  /** Whether a score cell exists on-chain. */
  hasScore: boolean;
}

export default function DepositCard({
  depositBalance,
  onCreateScoreCell,
  onTopUp,
  isLoading,
  error,
  lastTxHash,
  onClearError,
  hasScore,
}: DepositCardProps) {
  const [amount, setAmount] = useState('500');

  const isCreateMode = !hasScore;
  const balanceShannons = depositBalance ?? 0n;
  const lowBalance = hasScore && isLowBalance(balanceShannons);
  const updatesRemaining = hasScore ? estimateUpdatesRemaining(balanceShannons) : 0;
  const perUpdateFeeCKB = Number(DEFAULT_PER_UPDATE_FEE) / Number(SHANNON_PER_CKB);
  const minDepositCKB = Number(DEFAULT_MIN_DEPOSIT) / Number(SHANNON_PER_CKB);

  const handleSubmit = async () => {
    const ckbAmount = parseFloat(amount);
    if (isNaN(ckbAmount) || ckbAmount <= 0) return;
    onClearError();

    if (isCreateMode) {
      await onCreateScoreCell(ckbAmount);
    } else {
      await onTopUp(ckbAmount);
    }
  };

  const presetAmounts = isCreateMode ? [200, 500, 1000] : [100, 300, 500];

  return (
    <div className="bg-surface-container-low p-8 rounded-xl">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary">
              {isCreateMode ? 'add_circle' : 'account_balance_wallet'}
            </span>
          </div>
          <div>
            <h3 className="text-lg font-headline font-semibold text-on-surface">
              {isCreateMode ? 'Create Your Haven Score' : 'Deposit Balance'}
            </h3>
            <p className="text-xs text-on-surface-variant">
              {isCreateMode
                ? 'Deposit CKB to create your score cell on-chain'
                : 'Pre-deposited CKB for score updates'}
            </p>
          </div>
        </div>
      </div>

      {/* Balance Display -- only when score cell exists */}
      {hasScore && (
        <div className="mb-6">
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-headline font-bold text-on-surface">
              {formatCkbAmount(balanceShannons)}
            </span>
            <span className="text-sm text-secondary font-mono">CKB</span>
          </div>

          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-xs text-on-surface-variant">
              <span className="material-symbols-outlined text-xs">info</span>
              <span>~{updatesRemaining} updates remaining</span>
            </div>
            <div className="text-xs text-on-surface-variant/60">
              Fee: ~{perUpdateFeeCKB} CKB/update
            </div>
          </div>

          {lowBalance && (
            <div className="mt-4 flex items-start gap-2.5 p-3 rounded-lg bg-tertiary/10 border border-tertiary/20">
              <span className="material-symbols-outlined text-tertiary mt-0.5">
                warning
              </span>
              <div>
                <p className="text-sm font-headline font-medium text-tertiary">
                  Low Balance
                </p>
                <p className="text-xs text-tertiary/70 mt-0.5">
                  Top up your deposit to keep score updates running. Updates
                  pause when balance reaches zero.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create / Top Up Section */}
      <div className={hasScore ? 'border-t border-outline-variant/10 pt-6' : ''}>
        {isCreateMode && (
          <div className="mb-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Creating a Haven Score cell requires a one-time CKB deposit. This
              deposit covers future score update fees. You can top up later at
              any time.
            </p>
          </div>
        )}

        <h4 className="text-sm font-headline font-medium text-on-surface mb-3">
          {isCreateMode ? 'Deposit Amount' : 'Top Up Deposit'}
        </h4>

        {/* Preset Amounts */}
        <div className="flex gap-2 mb-3">
          {presetAmounts.map((preset) => (
            <button
              key={preset}
              onClick={() => setAmount(preset.toString())}
              className={`flex-1 py-2 rounded-lg text-xs font-mono transition-all border ${
                amount === preset.toString()
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-surface-container text-on-surface-variant border-outline-variant/20 hover:border-outline-variant/50'
              }`}
            >
              {preset} CKB
            </button>
          ))}
        </div>

        {/* Custom Amount Input */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                onClearError();
              }}
              placeholder={isCreateMode ? `Min ${minDepositCKB} CKB` : 'Custom amount'}
              min={isCreateMode ? minDepositCKB : 1}
              className="w-full px-4 py-3 rounded-lg bg-surface-container-lowest border-b border-outline-variant text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:border-primary transition-all font-mono"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant/60 font-mono">
              CKB
            </span>
          </div>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !amount || parseFloat(amount) <= 0}
            className="bg-transparent border border-[#d0bcff] text-[#d0bcff] font-bold px-6 py-3 rounded-lg text-sm transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isLoading ? (
              <span className="material-symbols-outlined text-sm animate-spin">
                progress_activity
              </span>
            ) : isCreateMode ? (
              'Create Score Cell'
            ) : (
              'Top Up'
            )}
          </button>
        </div>

        <p className="text-xs text-on-surface-variant/60 mt-2 font-mono">
          {isCreateMode
            ? `Minimum deposit: ${minDepositCKB} CKB. Recommended: 500 CKB (~166 score updates).`
            : `Minimum top-up: 1 CKB. Each score update costs ~${perUpdateFeeCKB} CKB.`}
        </p>

        {/* Error */}
        {error && (
          <div className="mt-3 p-3 rounded-lg bg-error-container/20 border border-error/20">
            <p className="text-xs text-error">{error}</p>
          </div>
        )}

        {/* Success */}
        {lastTxHash && (
          <div className="mt-3 p-3 rounded-lg bg-secondary/10 border border-secondary/20">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-sm">
                check_circle
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-secondary font-medium">
                  {isCreateMode
                    ? 'Score cell creation submitted!'
                    : 'Top-up submitted!'}
                </p>
                <p className="text-xs text-secondary/70 mt-0.5 truncate font-mono">
                  TX: {lastTxHash}
                </p>
              </div>
              <a
                href={`https://pudge.explorer.nervos.org/transaction/${lastTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 text-secondary hover:text-secondary/80 transition-colors"
                title="View on CKB Explorer"
              >
                <span className="material-symbols-outlined text-sm">
                  open_in_new
                </span>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
