import { useEffect, useRef, useCallback, useState } from 'react';
import ReactDOM from 'react-dom';

interface WalletProfilePopoverProps {
  isOpen: boolean;
  onClose: () => void;
  address: string;
  depositBalance: bigint;
  tier: string;
  identityCommitment: string | null;
  onDisconnect: () => void;
  onTopUp: () => void;
}

const SHANNON_PER_CKB = BigInt(100_000_000);

function formatBalance(shannon: bigint): string {
  const ckb = Number(shannon) / Number(SHANNON_PER_CKB);
  if (ckb >= 1_000_000) return (ckb / 1_000_000).toFixed(1) + 'M';
  if (ckb >= 1_000) return (ckb / 1_000).toFixed(1) + 'K';
  return Math.floor(ckb).toLocaleString();
}

function truncateAddress(address: string): string {
  if (address.length <= 12) return address;
  return address.slice(0, 6) + '...' + address.slice(-4);
}

function truncateCommitment(commitment: string): string {
  if (commitment.length <= 22) return commitment;
  return commitment.slice(0, 6) + '...' + commitment.slice(-13);
}

export default function WalletProfilePopover({
  isOpen,
  onClose,
  address,
  depositBalance,
  tier,
  identityCommitment,
  onDisconnect,
  onTopUp,
}: WalletProfilePopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleCopyCommitment = useCallback(() => {
    if (!identityCommitment) return;
    navigator.clipboard.writeText(identityCommitment).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [identityCommitment]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;

  const displayBalance = formatBalance(depositBalance);
  const displayAddress = truncateAddress(address);
  const displayCommitment = identityCommitment
    ? truncateCommitment(identityCommitment)
    : 'Registering...';

  const modal = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md bg-[#0d0e10] border border-[#292a2c]/15 rounded-xl overflow-hidden shadow-[0_40px_60px_-15px_rgba(208,188,255,0.06)] animate-fade-in"
        style={{ backdropFilter: 'blur(12px)' }}
      >
        {/* Header: Profile Identity */}
        <div className="p-6 bg-[#1b1c1e] border-b border-[#494454]/10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#343537] border border-[#d0bcff]/20 flex items-center justify-center overflow-hidden">
                <span className="material-symbols-outlined text-[#d0bcff] text-2xl">
                  account_circle
                </span>
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="font-['Space_Grotesk'] text-lg font-bold text-[#e3e2e5] leading-tight tracking-tight">
                    {displayAddress}
                  </h2>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(address);
                      setAddressCopied(true);
                      setTimeout(() => setAddressCopied(false), 2000);
                    }}
                    className="material-symbols-outlined text-sm text-[#cbc3d7]/50 hover:text-[#d0bcff] transition-colors"
                    title="Copy full address"
                  >
                    {addressCopied ? 'check' : 'content_copy'}
                  </button>
                </div>
                <p className="text-xs text-[#cbc3d7] font-['JetBrains_Mono'] opacity-60">
                  Haven Protocol User
                </p>
              </div>
            </div>
            <div className="bg-[#343537] px-3 py-1 rounded-full border border-[#44e2cd]/20 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-[#44e2cd] shadow-[0_0_8px_rgba(68,226,205,0.6)]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#44e2cd] font-['Space_Grotesk']">
                {tier}
              </span>
            </div>
          </div>

          {/* Identity Commitment Hash */}
          <div className="bg-[#0d0e10]/50 rounded-lg p-3 border-l-2 border-[#a078ff]">
            <label className="text-[10px] uppercase tracking-wider text-[#cbc3d7]/70 font-['Space_Grotesk'] font-bold block mb-1">
              Identity Commitment
            </label>
            <div className="flex items-center justify-between">
              <code className="font-['JetBrains_Mono'] text-xs text-[#d0bcff]/80 truncate pr-4">
                {displayCommitment}
              </code>
              {identityCommitment && (
                <button
                  onClick={handleCopyCommitment}
                  className="material-symbols-outlined text-sm text-[#cbc3d7] hover:text-[#d0bcff] transition-colors"
                >
                  {copied ? 'check' : 'content_copy'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Stats: Balance */}
        <div className="p-6 space-y-6">
          <div className="flex justify-between items-end">
            <div>
              <span className="text-[10px] uppercase tracking-widest text-[#cbc3d7] font-['Space_Grotesk'] font-bold">
                Deposit Balance
              </span>
              <div className="flex items-baseline gap-2">
                <h3 className="font-['Space_Grotesk'] text-4xl font-bold text-[#e3e2e5] tracking-tighter">
                  {displayBalance}
                </h3>
                <span className="text-[#d0bcff] font-['Space_Grotesk'] font-medium text-lg">
                  CKB
                </span>
              </div>
            </div>
            <button
              onClick={onTopUp}
              className="bg-transparent border border-[#d0bcff] text-[#d0bcff] px-4 py-2 rounded-lg font-['Space_Grotesk'] font-bold text-sm hover:brightness-110 active:scale-95 transition-all"
            >
              Top Up
            </button>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#1b1c1e] p-4 rounded-lg">
              <span className="text-[10px] uppercase tracking-widest text-[#cbc3d7] font-['Space_Grotesk'] font-bold block mb-1">
                Network Status
              </span>
              <div className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined text-[#44e2cd] text-lg"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  verified_user
                </span>
                <span className="text-sm font-medium text-[#e3e2e5]">
                  Shielded
                </span>
              </div>
            </div>
            <div className="bg-[#1b1c1e] p-4 rounded-lg">
              <span className="text-[10px] uppercase tracking-widest text-[#cbc3d7] font-['Space_Grotesk'] font-bold block mb-1">
                Last Sync
              </span>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#cbc3d7] text-lg">
                  update
                </span>
                <span className="text-sm font-medium text-[#e3e2e5]">
                  Just now
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Actions */}
        <div className="px-2 pb-2">
          <nav className="flex flex-col gap-1">
            <div className="h-px bg-[#494454]/10 my-1 mx-4" />

            <button
              onClick={onDisconnect}
              className="flex items-center gap-3 w-full p-4 rounded-lg hover:bg-[#ffb4ab]/10 transition-all duration-300 group"
            >
              <span className="material-symbols-outlined text-[#ffb4ab] opacity-70 group-hover:opacity-100 transition-opacity">
                logout
              </span>
              <span className="text-sm font-medium text-[#ffb4ab] opacity-70 group-hover:opacity-100 transition-opacity">
                Disconnect
              </span>
            </button>
          </nav>
        </div>

        {/* Footer Visual Accent */}
        <div className="h-1 bg-gradient-to-r from-transparent via-[#d0bcff]/30 to-transparent" />
      </div>

      {/* Decorative Aura */}
      <div className="fixed -z-10 w-[600px] h-[600px] bg-gradient-to-br from-[#d0bcff] to-[#a078ff] opacity-10 blur-[120px] rounded-full pointer-events-none" />
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
