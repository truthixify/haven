import { ccc } from '@ckb-ccc/connector-react';
import { useHavenScore } from '../hooks/useHavenScore';
import { useDeposit } from '../hooks/useDeposit';
import { useSystemStatus } from '../hooks/useSystemStatus';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import { getTierForScore } from '@haven-protocol/ckb-sdk';
import type { ScoreBreakdown as BreakdownType } from '@haven-protocol/ckb-sdk';
import { formatCkbAmount } from '../hooks/useDeposit';
import ScoreHistoryChart from '../components/score/ScoreHistory';
import ActionLoadingOverlay from '../components/loading/ActionLoadingOverlay';

export default function Dashboard() {
  const { wallet, open } = ccc.useCcc();
  const { score, hasScore, history, isLoading, refresh } = useHavenScore();
  const {
    isLoading: isDepositLoading,
    error: depositError,
    lastTxHash,
    createScoreCell,
    topUp,
  } = useDeposit();

  // Not connected state
  if (!wallet) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-surface-container-low p-10 rounded-xl max-w-md text-center">
          <span className="material-symbols-outlined text-5xl text-primary mb-6 block">
            lock
          </span>
          <h1 className="text-2xl font-headline font-bold text-[#e3e2e5] mb-3">
            Connect Your Wallet
          </h1>
          <p className="text-sm text-[#cbc3d7] mb-8 leading-relaxed">
            Connect your CKB wallet to view your Haven Score, manage your
            deposit balance, and access your personalized dashboard.
          </p>
          <button
            onClick={open}
            className="bg-transparent border border-[#d0bcff] text-[#d0bcff] font-bold py-3 px-8 rounded-lg text-sm transition-all hover:brightness-125 active:scale-95"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <ActionLoadingOverlay
        isOpen={true}
        title="Loading Haven Dashboard"
        description="Querying your Haven Score cell and deposit balance from CKB testnet."
        steps={[
          { label: 'Resolving Wallet Lock Hash', status: 'verified' },
          { label: 'Searching Score Cells on CKB', status: 'processing' },
        ]}
      />
    );
  }

  // No score found on-chain — show create score flow matching stitch layout
  if (!hasScore) {
    const handleCreate = async (amount: number) => {
      const txHash = await createScoreCell(amount);
      if (txHash) {
        refresh();
      }
    };

    return (
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left — info card matching stitch hero layout */}
        <div className="lg:col-span-7 bg-surface-container-low p-6 md:p-10 rounded-xl relative overflow-hidden">
          {/* Subtle background noise/gradient */}
          <div className="absolute inset-0 opacity-10 pointer-events-none sovereign-gradient mix-blend-overlay" />
          <div className="relative z-10 flex flex-col items-start">
            <span className="text-xs font-mono text-secondary tracking-tighter mb-4">
              INITIALIZE REPUTATION
            </span>
            <div className="flex items-end gap-6 mb-8">
              <h2 className="text-4xl md:text-8xl font-headline font-bold tracking-tighter text-[#e3e2e5]">
                Create
              </h2>
              <div className="mb-4">
                <span className="block text-xs font-headline uppercase tracking-widest text-[#cbc3d7]">
                  Score Tier
                </span>
                <span className="inline-flex items-center px-3 py-1 bg-[#343537] text-primary text-sm font-bold rounded-full border border-[#d0bcff]/20 shadow-[0_0_15px_rgba(208,188,255,0.1)]">
                  New User
                </span>
              </div>
            </div>
            <p className="max-w-md text-[#cbc3d7] text-sm leading-relaxed">
              Deposit CKB to create your score cell on-chain. This is a
              one-time action that initializes your cryptographic reputation on
              the Sovereign Privacy Layer.
            </p>
            {isDepositLoading && (
              <div className="flex items-center gap-3 text-primary mt-4">
                <span className="material-symbols-outlined animate-spin">
                  progress_activity
                </span>
                <span className="text-sm font-mono">
                  {lastTxHash
                    ? 'Waiting for confirmation...'
                    : 'Submitting transaction...'}
                </span>
              </div>
            )}
            {depositError && (
              <p className="text-sm text-error mt-4">{depositError}</p>
            )}
          </div>
          {/* Decorative Element */}
          <div className="absolute -right-8 -bottom-8 w-64 h-40 border-2 border-[#d0bcff]/10 rounded-xl" />
        </div>

        {/* Right — deposit form matching stitch wallet card layout */}
        <div className="lg:col-span-5 bg-surface-container-high p-6 md:p-8 rounded-xl flex flex-col justify-between h-full border-l-2 border-secondary">
          <div>
            <span className="text-xs font-headline uppercase tracking-widest text-[#cbc3d7] mb-6 block">
              Initial Deposit
            </span>
            <p className="text-xs font-mono text-[#cbc3d7]/60 mt-2 uppercase">
              Minimum: 200 CKB / Recommended: 500 CKB
            </p>
          </div>
          <div className="mt-8 space-y-3">
            {[200, 500, 1000].map((amt) => (
              <button
                key={amt}
                onClick={() => !isDepositLoading && handleCreate(amt)}
                disabled={isDepositLoading}
                className={`w-full py-4 text-xs font-headline font-bold uppercase tracking-widest transition-all active:scale-95 ${
                  amt === 500
                    ? 'bg-transparent border border-[#d0bcff] text-[#d0bcff]'
                    : 'border border-outline-variant hover:bg-[#343537] text-primary'
                } ${isDepositLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {amt} CKB
              </button>
            ))}
            <p className="text-[10px] font-mono text-[#cbc3d7]/40 mt-4">
              ~{Math.floor(500 / 3)} score updates included with 500 CKB
              deposit. You can top up at any time.
            </p>
          </div>
        </div>

        {/* Loading overlay for score cell creation */}
        <ActionLoadingOverlay
          isOpen={isDepositLoading}
          title={lastTxHash ? 'Confirming Transaction' : 'Creating Score Cell'}
          description={
            lastTxHash
              ? 'Waiting for on-chain confirmation. This may take up to 2 minutes.'
              : 'Building your Haven Score cell on CKB.'
          }
          steps={
            lastTxHash
              ? [
                  { label: 'Transaction Submitted', status: 'verified' },
                  { label: 'Awaiting CKB Confirmation', status: 'processing' },
                ]
              : [
                  { label: 'Building CKB Transaction', status: 'processing' },
                ]
          }
        />
      </section>
    );
  }

  // Score exists - full dashboard view matching stitch exactly
  const tierName = getTierForScore(score!.score);
  const breakdown = score!.breakdown;
  const depositBalance = score!.depositBalance;

  return (
    <>
      {/* Hero: Haven Score Display — matches stitch section grid */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 bg-surface-container-low p-6 md:p-10 rounded-xl relative overflow-hidden group">
          {/* Subtle background noise/gradient */}
          <div className="absolute inset-0 opacity-10 pointer-events-none sovereign-gradient mix-blend-overlay" />
          <div className="relative z-10 flex flex-col items-start">
            <span className="text-xs font-mono text-secondary tracking-tighter mb-4">
              CRITICAL REPUTATION INDEX
            </span>
            <div className="flex items-end gap-6 mb-8">
              <h2 className="text-6xl md:text-8xl font-headline font-bold tracking-tighter text-[#e3e2e5]">
                {score!.score}
              </h2>
              <div className="mb-4">
                <span className="block text-xs font-headline uppercase tracking-widest text-[#cbc3d7]">
                  Score Tier
                </span>
                <span className="inline-flex items-center mt-2 px-3 py-1 bg-[#343537] text-primary text-sm font-bold rounded-full border border-[#d0bcff]/20 shadow-[0_0_15px_rgba(208,188,255,0.1)]">
                  {tierName}
                </span>
              </div>
            </div>
            <p className="max-w-md text-[#cbc3d7] text-sm leading-relaxed">
              Your Haven Score represents your cryptographic standing within the
              Sovereign Privacy Layer. Maintain hygiene to preserve {tierName}{' '}
              status.
            </p>
          </div>
          {/* Decorative Element */}
          <div className="absolute -right-8 -bottom-8 w-64 h-40 border-2 border-[#d0bcff]/10 rounded-xl" />
        </div>

        {/* Wallet Card */}
        <div className="lg:col-span-5 bg-surface-container-high p-6 md:p-8 rounded-xl flex flex-col justify-between h-full border-l-2 border-secondary">
          <div>
            <span className="text-xs font-headline uppercase tracking-widest text-[#cbc3d7] mb-6 block">
              Sovereign Liquidity
            </span>
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl md:text-4xl font-headline font-bold text-[#e3e2e5]">
                {formatCkbAmount(depositBalance)}
              </h3>
              <span className="text-secondary font-mono text-lg md:text-xl">
                CKB
              </span>
            </div>
            <p className="text-xs font-mono text-[#cbc3d7]/60 mt-2 uppercase">
              Status: Isolated / Private
            </p>
          </div>
          <div className="mt-8">
            <button
              onClick={() => topUp(100)}
              disabled={isDepositLoading}
              className="w-full py-4 border border-outline-variant hover:bg-[#343537] transition-all duration-200 text-primary font-headline uppercase tracking-widest text-xs font-bold active:scale-95"
            >
              {isDepositLoading ? 'Processing...' : 'Top Up Balance'}
            </button>
          </div>
          {depositError && (
            <p className="text-xs text-error mt-2">{depositError}</p>
          )}
          {lastTxHash && (
            <a
              href={`https://pudge.explorer.nervos.org/transaction/${lastTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-secondary mt-2 truncate hover:text-[#44e2cd] transition-colors"
            >
              <span className="material-symbols-outlined text-xs">open_in_new</span>
              View Transaction
            </a>
          )}
        </div>
      </section>

      {/* Metrics Bento Grid — Integrity Breakdown */}
      <IntegrityBreakdown breakdown={breakdown} issuedAt={score!.issuedAt} />

      {/* Score History Section */}
      <ScoreHistoryChart
        history={history}
        currentScore={score!.score}
        currentEpoch={score!.epoch}
      />

      {/* Loading overlay for deposit/top-up transactions */}
      <ActionLoadingOverlay
        isOpen={isDepositLoading}
        title={lastTxHash ? 'Confirming Transaction' : 'Securing Protocol Action'}
        description={
          lastTxHash
            ? 'Waiting for on-chain confirmation of your transaction.'
            : 'Generating cryptographic proofs for the requested state transition.'
        }
        steps={
          lastTxHash
            ? [
                { label: 'Transaction Submitted', status: 'verified' },
                { label: 'Awaiting CKB Confirmation', status: 'processing' },
              ]
            : [
                { label: 'Phala TEE Attesting', status: 'verified' },
                { label: 'Building CKB Transaction', status: 'processing' },
              ]
        }
      />
    </>
  );
}

/** Integrity Breakdown — direct from stitch HTML, no dynamic class construction */
function IntegrityBreakdown({
  breakdown,
  issuedAt,
}: {
  breakdown: BreakdownType;
  issuedAt: number;
}) {
  const { lastAttestation, ckbBlockNumber } = useSystemStatus();
  const privacyPct = breakdown.privacy > 0 ? Math.min(100, Math.round((breakdown.privacy / 400) * 100)) : 40;
  const contribPct = breakdown.contribution > 0 ? Math.min(100, Math.round((breakdown.contribution / 300) * 100)) : 30;
  const humanPct = breakdown.humanity > 0 ? Math.min(100, Math.round((breakdown.humanity / 200) * 100)) : 20;
  const communityPct = breakdown.community > 0 ? Math.min(100, Math.round((breakdown.community / 100) * 100)) : 10;

  // Derive last sync label: prefer real attestation timestamp, fall back to
  // block-number-based estimate (assuming ~10s per CKB block).
  const lastSyncLabel = (() => {
    if (lastAttestation) {
      return `Last Sync: ${formatRelativeTime(lastAttestation)}`;
    }
    if (issuedAt > 0 && ckbBlockNumber !== null && ckbBlockNumber > issuedAt) {
      const blockDiff = ckbBlockNumber - issuedAt;
      const approxMs = blockDiff * 10_000; // ~10s per block
      return `Last Sync: ${formatRelativeTime(Date.now() - approxMs)}`;
    }
    return 'Last Sync: --';
  })();

  return (
    <section className="space-y-6">
      <div className="flex justify-between items-end">
        <h3 className="text-xl font-['Space_Grotesk'] font-bold text-[#e3e2e5] tracking-tight">Integrity Breakdown</h3>
        <span className="text-xs font-['JetBrains_Mono'] text-[#cbc3d7]/60 uppercase">{lastSyncLabel}</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Metric 1: Privacy Hygiene */}
        <div className="bg-[#1f2022] p-6 rounded-lg group hover:bg-surface-container-high transition-all">
          <div className="flex justify-between items-start mb-6">
            <span className="material-symbols-outlined text-primary">security</span>
            <span className="text-2xl font-['JetBrains_Mono'] font-bold text-[#e3e2e5]">40%</span>
          </div>
          <p className="text-sm font-['Space_Grotesk'] font-medium text-[#e3e2e5] mb-1">Privacy Hygiene</p>
          <div className="h-1 w-full bg-[#343537] rounded-full overflow-hidden">
            <div className="h-full bg-[#d0bcff]" style={{ width: `${privacyPct}%` }} />
          </div>
        </div>
        {/* Metric 2: Ecosystem Contribution */}
        <div className="bg-[#1f2022] p-6 rounded-lg group hover:bg-surface-container-high transition-all">
          <div className="flex justify-between items-start mb-6">
            <span className="material-symbols-outlined text-secondary">hub</span>
            <span className="text-2xl font-['JetBrains_Mono'] font-bold text-[#e3e2e5]">30%</span>
          </div>
          <p className="text-sm font-['Space_Grotesk'] font-medium text-[#e3e2e5] mb-1">Ecosystem Contribution</p>
          <div className="h-1 w-full bg-[#343537] rounded-full overflow-hidden">
            <div className="h-full bg-[#44e2cd]" style={{ width: `${contribPct}%` }} />
          </div>
        </div>
        {/* Metric 3: Proof of Human */}
        <div className="bg-[#1f2022] p-6 rounded-lg group hover:bg-surface-container-high transition-all">
          <div className="flex justify-between items-start mb-6">
            <span className="material-symbols-outlined text-tertiary">person_check</span>
            <span className="text-2xl font-['JetBrains_Mono'] font-bold text-[#e3e2e5]">20%</span>
          </div>
          <p className="text-sm font-['Space_Grotesk'] font-medium text-[#e3e2e5] mb-1">Proof of Human</p>
          <div className="h-1 w-full bg-[#343537] rounded-full overflow-hidden">
            <div className="h-full bg-[#ffb869]" style={{ width: `${humanPct}%` }} />
          </div>
        </div>
        {/* Metric 4: Community Engagement */}
        <div className="bg-[#1f2022] p-6 rounded-lg group hover:bg-surface-container-high transition-all">
          <div className="flex justify-between items-start mb-6">
            <span className="material-symbols-outlined text-[#cbc3d7]">group</span>
            <span className="text-2xl font-['JetBrains_Mono'] font-bold text-[#e3e2e5]">10%</span>
          </div>
          <p className="text-sm font-['Space_Grotesk'] font-medium text-[#e3e2e5] mb-1">Community Engagement</p>
          <div className="h-1 w-full bg-[#343537] rounded-full overflow-hidden">
            <div className="h-full bg-[#cbc3d7]" style={{ width: `${communityPct}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}
