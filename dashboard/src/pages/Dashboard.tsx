import { useState, useCallback } from 'react';
import { ccc } from '@ckb-ccc/connector-react';
import { useHavenScore } from '../hooks/useHavenScore';
import { useDeposit } from '../hooks/useDeposit';
import type { TopUpStep } from '../hooks/useDeposit';
import { useAuth } from '../hooks/useAuth';
import { useSystemStatus } from '../hooks/useSystemStatus';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import { getTierForScore } from '@haven-protocol-ckb/sdk';
import type { ScoreBreakdown as BreakdownType } from '@haven-protocol-ckb/sdk';
import { HavenTeeClient } from '@haven-protocol-ckb/sdk/tee';
import { formatCkbAmount } from '../hooks/useDeposit';
import { config } from '../config';
import ScoreHistoryChart from '../components/score/ScoreHistory';
import ActionLoadingOverlay from '../components/loading/ActionLoadingOverlay';

export default function Dashboard() {
  const { wallet, open } = ccc.useCcc();
  const { score, hasScore, history, isLoading, refresh } = useHavenScore();
  const {
    identityCommitment,
    isLoading: isAuthLoading,
    isChecking: isAuthChecking,
    registrationError,
    registerWalletIdentity,
  } = useAuth();
  const {
    isLoading: isDepositLoading,
    error: depositError,
    lastTxHash,
    topUpStep,
    createScoreCell,
    topUp,
  } = useDeposit();

  // Score refresh: calls TEE to re-score, then re-reads chain
  const [isScoreRefreshing, setIsScoreRefreshing] = useState(false);
  const handleScoreRefresh = useCallback(async () => {
    if (!identityCommitment || isScoreRefreshing) return;
    setIsScoreRefreshing(true);
    try {
      const tee = new HavenTeeClient(config.teeEndpoint);
      await tee.requestScoreRefresh(identityCommitment);
      refresh();
    } catch {
      // silent — refresh is best-effort
    } finally {
      setIsScoreRefreshing(false);
    }
  }, [identityCommitment, isScoreRefreshing, refresh]);

  // Balance refresh: just re-reads chain data (no TEE call)
  const [isBalanceRefreshing, setIsBalanceRefreshing] = useState(false);
  const handleBalanceRefresh = useCallback(async () => {
    if (isBalanceRefreshing) return;
    setIsBalanceRefreshing(true);
    try {
      refresh();
      // Small delay so the spin animation is visible
      await new Promise(r => setTimeout(r, 1000));
    } finally {
      setIsBalanceRefreshing(false);
    }
  }, [isBalanceRefreshing, refresh]);

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

  // Show loading overlay while resolving identity or searching score cells
  if (isLoading || isAuthChecking) {
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

  // No score — two-step onboarding: 1) Register Identity, 2) Create Score Cell
  if (!hasScore) {
    const needsIdentity = !identityCommitment;

    const handleCreate = async (amount: number) => {
      const txHash = await createScoreCell(amount);
      if (txHash) {
        refresh();
      }
    };

    return (
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left — info */}
        <div className="lg:col-span-7 bg-surface-container-low p-6 md:p-10 rounded-xl relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 pointer-events-none sovereign-gradient mix-blend-overlay" />
          <div className="relative z-10 flex flex-col items-start">
            <span className="text-xs font-mono text-secondary tracking-tighter mb-4">
              {needsIdentity ? 'STEP 1 OF 2' : 'STEP 2 OF 2'}
            </span>
            <div className="flex items-end gap-6 mb-8">
              <h2 className="text-4xl md:text-7xl font-headline font-bold tracking-tighter text-[#e3e2e5]">
                {needsIdentity ? 'Register' : 'Create'}
              </h2>
              <div className="mb-4">
                <span className="block text-xs font-headline uppercase tracking-widest text-[#cbc3d7]">
                  {needsIdentity ? 'Identity' : 'Score Cell'}
                </span>
                <span className="inline-flex items-center mt-2 px-3 py-1 bg-[#343537] text-primary text-sm font-bold rounded-full border border-[#d0bcff]/20 shadow-[0_0_15px_rgba(208,188,255,0.1)]">
                  New User
                </span>
              </div>
            </div>
            <p className="max-w-md text-[#cbc3d7] text-sm leading-relaxed">
              {needsIdentity
                ? 'Sign a message with your wallet to create your cryptographic identity. This links your wallet to Haven Protocol via the Phala TEE.'
                : 'Deposit CKB to create your score cell on-chain. This initializes your reputation on the Sovereign Privacy Layer.'}
            </p>
            {isAuthLoading && (
              <div className="flex items-center gap-3 text-primary mt-4">
                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                <span className="text-sm font-mono">Awaiting wallet signature...</span>
              </div>
            )}
            {registrationError && (
              <p className="text-sm text-[#ffb4ab] mt-4">{registrationError}</p>
            )}
            {isDepositLoading && (
              <div className="flex items-center gap-3 text-primary mt-4">
                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                <span className="text-sm font-mono">
                  {lastTxHash ? 'Waiting for confirmation...' : 'Submitting transaction...'}
                </span>
              </div>
            )}
            {depositError && (
              <p className="text-sm text-[#ffb4ab] mt-4">{depositError}</p>
            )}
          </div>
          <div className="absolute -right-8 -bottom-8 w-64 h-40 border-2 border-[#d0bcff]/10 rounded-xl" />
        </div>

        {/* Right — action panel */}
        <div className="lg:col-span-5 bg-surface-container-high p-6 md:p-8 rounded-xl flex flex-col justify-between h-full border-l-2 border-secondary">
          {needsIdentity ? (
            <>
              <div>
                <span className="text-xs font-headline uppercase tracking-widest text-[#cbc3d7] mb-6 block">
                  Register Identity
                </span>
                <p className="text-xs font-mono text-[#cbc3d7]/60 mt-2 uppercase">
                  One-time signature to verify wallet ownership
                </p>
              </div>
              <div className="mt-8">
                <button
                  onClick={registerWalletIdentity}
                  disabled={isAuthLoading}
                  className={`w-full py-4 text-xs font-headline font-bold uppercase tracking-widest transition-all active:scale-95 bg-transparent border border-[#d0bcff] text-[#d0bcff] ${
                    isAuthLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isAuthLoading ? 'Signing...' : 'Sign & Register'}
                </button>
                <p className="text-[10px] font-mono text-[#cbc3d7]/40 mt-4">
                  Your identity commitment is a Blake2b hash of your public key.
                  It appears on the leaderboard but cannot be linked to your wallet.
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-[#44e2cd] text-sm">check_circle</span>
                  <span className="text-[10px] font-mono text-[#44e2cd] uppercase tracking-widest">Identity Registered</span>
                </div>
                <span className="text-xs font-headline uppercase tracking-widest text-[#cbc3d7] mb-6 block">
                  Initial Deposit
                </span>
                <p className="text-xs font-mono text-[#cbc3d7]/60 mt-2 uppercase">
                  Minimum: 1000 CKB / Recommended: 2000 CKB
                </p>
              </div>
              <div className="mt-8 space-y-3">
                {[1000, 2000, 5000].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => !isDepositLoading && handleCreate(amt)}
                    disabled={isDepositLoading}
                    className={`w-full py-4 text-xs font-headline font-bold uppercase tracking-widest transition-all active:scale-95 ${
                      amt === 2000
                        ? 'bg-transparent border border-[#d0bcff] text-[#d0bcff]'
                        : 'border border-outline-variant hover:bg-[#343537] text-primary'
                    } ${isDepositLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {amt} CKB
                  </button>
                ))}
                <p className="text-[10px] font-mono text-[#cbc3d7]/40 mt-4">
                  ~{Math.floor(2000 / 3)} score updates included. Score updates every 24 hours.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Loading overlays */}
        <ActionLoadingOverlay
          isOpen={isAuthLoading}
          title="Registering Sovereign Identity"
          description="Sign the message in your wallet to verify ownership with the Phala TEE."
          steps={[{ label: 'Awaiting Wallet Signature', status: 'processing' }]}
        />
        <ActionLoadingOverlay
          isOpen={isDepositLoading}
          title={lastTxHash ? 'Confirming Transaction' : 'Creating Score Cell'}
          description={lastTxHash ? 'Waiting for on-chain confirmation.' : 'Building your Haven Score cell on CKB.'}
          steps={
            lastTxHash
              ? [{ label: 'Transaction Submitted', status: 'verified' }, { label: 'Awaiting CKB Confirmation', status: 'processing' }]
              : [{ label: 'Building CKB Transaction', status: 'processing' }]
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
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs font-mono text-secondary tracking-tighter">
                CRITICAL REPUTATION INDEX
              </span>
              <button
                onClick={handleScoreRefresh}
                disabled={isScoreRefreshing}
                title="Refresh score"
                className="p-1 rounded-md text-[#cbc3d7]/60 hover:text-primary hover:bg-[#343537] transition-all disabled:opacity-40"
              >
                <span className={`material-symbols-outlined text-base ${isScoreRefreshing ? 'animate-spin' : ''}`}>
                  refresh
                </span>
              </button>
            </div>
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
            <div className="flex items-center gap-2 mt-4 text-[10px] font-mono text-[#cbc3d7]/50 uppercase tracking-widest">
              <span className="material-symbols-outlined text-xs">schedule</span>
              Next score update: daily at 00:00 UTC
            </div>
          </div>
          {/* Decorative Element */}
          <div className="absolute -right-8 -bottom-8 w-64 h-40 border-2 border-[#d0bcff]/10 rounded-xl" />
        </div>

        {/* Wallet Card */}
        <div className="lg:col-span-5 bg-surface-container-high p-6 md:p-8 rounded-xl flex flex-col justify-between h-full border-l-2 border-secondary">
          <div>
            <div className="flex items-center justify-between mb-6">
              <span className="text-xs font-headline uppercase tracking-widest text-[#cbc3d7]">
                Sovereign Liquidity
              </span>
              <button
                onClick={handleBalanceRefresh}
                disabled={isBalanceRefreshing}
                title="Refresh balance"
                className="p-1 rounded-md text-[#cbc3d7]/60 hover:text-primary hover:bg-[#343537] transition-all disabled:opacity-40"
              >
                <span className={`material-symbols-outlined text-base ${isBalanceRefreshing ? 'animate-spin' : ''}`}>
                  refresh
                </span>
              </button>
            </div>
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
          <div className="mt-8 space-y-3">
            <span className="text-[10px] font-mono text-[#cbc3d7]/60 uppercase tracking-widest">
              Top Up Deposit
            </span>
            <div className="grid grid-cols-3 gap-2">
              {[100, 500, 1000].map((amt) => (
                <button
                  key={amt}
                  onClick={() => topUp(amt)}
                  disabled={isDepositLoading}
                  className="py-3 border border-outline-variant hover:bg-[#343537] hover:border-[#d0bcff]/30 transition-all duration-200 text-primary font-mono text-xs font-bold active:scale-95 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {amt} CKB
                </button>
              ))}
            </div>
            <p className="text-[10px] font-mono text-[#cbc3d7]/40 text-center">
              ~3 CKB per update / scores update daily
            </p>
          </div>
          {depositError && (
            <p className="text-xs text-error mt-2">{depositError}</p>
          )}
          {lastTxHash && (
            <a
              href={`https://testnet.explorer.nervos.org/transaction/${lastTxHash}`}
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

      {/* Loading overlay for top-up transactions */}
      <ActionLoadingOverlay
        isOpen={isDepositLoading}
        title={
          topUpStep === 'confirming'
            ? 'Confirming Transaction'
            : topUpStep === 'signing-wallet'
              ? 'Wallet Approval'
              : topUpStep === 'signing-tee'
                ? 'TEE Co-Signing'
                : 'Topping Up Deposit'
        }
        description={
          topUpStep === 'confirming'
            ? 'Waiting for on-chain confirmation.'
            : topUpStep === 'signing-wallet'
              ? 'Approve the transaction in your wallet.'
              : topUpStep === 'signing-tee'
                ? 'The Phala TEE is co-signing the Haven lock witness.'
                : 'Building and signing your top-up transaction.'
        }
        steps={topUpSteps(topUpStep)}
      />
    </>
  );
}

/** Build step list for the top-up loading overlay. */
const TOPUP_STEP_ORDER: TopUpStep[] = [
  'finding-cell', 'building-tx', 'signing-wallet', 'signing-tee', 'submitting', 'confirming',
];
const TOPUP_STEP_LABELS: Record<string, string> = {
  'finding-cell': 'Locating Score Cell',
  'building-tx': 'Building Transaction',
  'signing-wallet': 'Wallet Signing Fee Cells',
  'signing-tee': 'TEE Co-Signing Haven Lock',
  'submitting': 'Submitting to CKB',
  'confirming': 'Awaiting Confirmation',
};
function topUpSteps(current: TopUpStep) {
  const idx = current ? TOPUP_STEP_ORDER.indexOf(current) : -1;
  return TOPUP_STEP_ORDER.map((step, i) => ({
    label: TOPUP_STEP_LABELS[step],
    status: (i < idx ? 'verified' : i === idx ? 'processing' : 'pending') as 'verified' | 'processing' | 'pending',
  }));
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
