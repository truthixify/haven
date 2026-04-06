import { ccc } from '@ckb-ccc/connector-react';
import { useState, useRef, useEffect } from 'react';

export default function ConnectWallet() {
  const { open, disconnect, wallet } = ccc.useCcc();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!wallet) {
    return (
      <button
        onClick={open}
        className="w-full bg-transparent border border-[#d0bcff] text-[#d0bcff] font-bold py-3 rounded-lg text-sm transition-all hover:brightness-110 active:scale-95"
      >
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="w-full bg-transparent border border-[#d0bcff] text-[#d0bcff] font-bold py-3 rounded-lg text-sm transition-all hover:brightness-110 active:scale-95 flex items-center justify-center gap-2"
      >
        <span className="w-2 h-2 rounded-full bg-on-primary-container/60 animate-pulse" />
        <span className="max-w-[120px] truncate">
          {wallet.name || 'Connected'}
        </span>
      </button>

      {dropdownOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg bg-surface-container-high border border-outline-variant/20 shadow-xl py-1 animate-fade-in z-50">
          <div className="px-4 py-2.5 border-b border-outline-variant/10">
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">
              Connected with
            </p>
            <p className="text-sm font-headline font-medium text-on-surface truncate">
              {wallet.name}
            </p>
          </div>
          <button
            onClick={() => {
              disconnect();
              setDropdownOpen(false);
            }}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-error hover:bg-error/10 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">logout</span>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
