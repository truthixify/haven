import { useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ccc, useSigner } from '@ckb-ccc/connector-react';
import { getTierForScore } from '@haven-protocol-ckb/sdk';
import WalletProfilePopover from '../wallet/WalletProfilePopover';
import { useAuth } from '../../hooks/useAuth';
import { useHavenScore } from '../../hooks/useHavenScore';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/identity', label: 'Identity', icon: 'fingerprint' },
  { to: '/leaderboard', label: 'Leaderboard', icon: 'leaderboard' },
  { to: '/ecosystem', label: 'Ecosystem', icon: 'work' },
];

export default function Sidebar() {
  const location = useLocation();
  const { open, disconnect, wallet } = ccc.useCcc();
  const signer = useSigner();

  const { address, identityCommitment } = useAuth();
  const { score } = useHavenScore();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const handleConnectClick = useCallback(() => {
    if (wallet) {
      setIsPopoverOpen((prev) => !prev);
    } else {
      open();
    }
  }, [wallet, open]);

  const handlePopoverClose = useCallback(() => {
    setIsPopoverOpen(false);
  }, []);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setIsPopoverOpen(false);
  }, [disconnect]);

  const handleTopUp = useCallback(() => {
    setIsPopoverOpen(false);
    // Navigate to deposit or open a top-up flow — for now just close
  }, []);

  // Mobile: handle wallet button — same behavior as desktop
  const handleMobileWalletClick = useCallback(() => {
    if (wallet) {
      setIsPopoverOpen((prev) => !prev);
    } else {
      open();
    }
  }, [wallet, open]);

  // Derive tier from score, default to "Observer"
  const tier = score ? getTierForScore(score.score) : 'Observer';
  const depositBalance = score?.depositBalance ?? BigInt(0);

  return (
    <>
      {/* Desktop Sidebar — hidden on mobile, matches stitch <aside> exactly */}
      <aside className="hidden md:flex h-screen w-64 fixed left-0 top-0 border-r-0 bg-[#121315] shadow-[40px_0_60px_-15px_rgba(208,188,255,0.06)] flex-col py-8 z-50">
        <div className="px-8 mb-12">
          <Link to="/dashboard">
            <h1 className="text-2xl font-bold tracking-tighter text-[#d0bcff] font-['Space_Grotesk']">
              HAVEN
            </h1>
          </Link>
          <p className="text-[10px] font-['JetBrains_Mono'] text-[#44e2cd] tracking-widest mt-1 uppercase">
            Protocol
          </p>
        </div>
        <nav className="flex-1 space-y-2 px-4">
          {NAV_ITEMS.map((item) => {
            const isActive =
              location.pathname === item.to ||
              (item.to === '/dashboard' && location.pathname === '/');
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-4 px-4 py-3 transition-all duration-200 ease-in-out active:scale-95 font-['Space_Grotesk'] tracking-tight ${
                  isActive
                    ? 'text-[#d0bcff] font-bold border-l-2 border-[#d0bcff] bg-[#292a2c]'
                    : 'text-[#cbc3d7] hover:text-[#e3e2e5] hover:bg-[#292a2c]/50'
                }`}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-6 mt-auto relative">
          {wallet ? (
            <button
              data-wallet-trigger
              onClick={handleConnectClick}
              className="w-full bg-transparent border border-[#d0bcff] text-[#d0bcff] font-bold py-3 rounded-lg text-sm transition-all hover:brightness-125 active:scale-95"
            >
              <span className="flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#44e2cd] animate-pulse" />
                Connected
              </span>
            </button>
          ) : (
            <button
              data-wallet-trigger
              onClick={handleConnectClick}
              className="w-full bg-transparent border border-[#d0bcff] text-[#d0bcff] font-bold py-3 rounded-lg text-sm transition-all hover:brightness-125 active:scale-95"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Bottom Navigation — visible only on mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#121315] border-t border-[#cbc3d7]/15 z-50 flex items-center justify-around py-2 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive =
            location.pathname === item.to ||
            (item.to === '/dashboard' && location.pathname === '/');
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-all ${
                isActive ? 'text-[#d0bcff]' : 'text-[#cbc3d7]'
              }`}
            >
              <span className="material-symbols-outlined text-xl">
                {item.icon}
              </span>
              <span className="text-[9px] font-['Space_Grotesk'] tracking-tight font-medium">
                {item.label}
              </span>
            </Link>
          );
        })}
        <button
          onClick={handleMobileWalletClick}
          className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-all ${
            wallet ? 'text-[#44e2cd]' : 'text-[#cbc3d7]'
          }`}
        >
          <span className="material-symbols-outlined text-xl">
            account_balance_wallet
          </span>
          <span className="text-[9px] font-['Space_Grotesk'] tracking-tight font-medium">
            {wallet ? 'Wallet' : 'Connect'}
          </span>
        </button>
      </nav>

      {/* Wallet Profile Popover — shared by desktop and mobile, renders via portal */}
      {wallet && signer && address && (
        <WalletProfilePopover
          isOpen={isPopoverOpen}
          onClose={handlePopoverClose}
          address={address}
          depositBalance={depositBalance}
          tier={tier}
          identityCommitment={identityCommitment}
          onDisconnect={handleDisconnect}
          onTopUp={handleTopUp}
        />
      )}
    </>
  );
}
