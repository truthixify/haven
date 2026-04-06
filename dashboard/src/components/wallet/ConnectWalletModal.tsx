import { useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { ccc } from '@ckb-ccc/connector-react';

interface ConnectWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: () => void;
}

export default function ConnectWalletModal({
  isOpen,
  onClose,
  onConnect,
}: ConnectWalletModalProps) {
  const { open, wallet } = ccc.useCcc();

  // When wallet connects while modal is open, close the modal
  useEffect(() => {
    if (wallet && isOpen) {
      onConnect();
    }
  }, [wallet, isOpen, onConnect]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleWalletClick = useCallback(() => {
    open();
  }, [open]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      {/* Connect Wallet Modal — 1:1 from stitch connect_wallet_modal/code.html */}
      <div className="w-full max-w-lg bg-[#0d0e10] border border-[#292a2c]/15 rounded-xl shadow-[0_40px_60px_-15px_rgba(208,188,255,0.12)] overflow-hidden animate-fade-in">
        {/* Modal Header */}
        <div className="px-8 pt-10 pb-6 text-left">
          <h2 className="text-3xl font-bold tracking-tighter font-['Space_Grotesk'] text-[#e3e2e5] mb-2">
            Connect to Haven
          </h2>
          <p className="text-[#cbc3d7] text-sm font-light">
            Establish your private identity on Nervos CKB.
          </p>
        </div>

        {/* Wallet List */}
        <div className="px-8 pb-4 space-y-3">
          {/* JoyID (Passkey) */}
          <button
            onClick={handleWalletClick}
            className="w-full group flex items-center justify-between p-4 bg-[#1b1c1e] hover:bg-[#292a2c] transition-all duration-300 rounded-lg"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 flex items-center justify-center bg-[#a078ff]/20 rounded-lg group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[#d0bcff] text-2xl">
                  fingerprint
                </span>
              </div>
              <div className="text-left">
                <span className="block font-['Space_Grotesk'] font-semibold text-[#e3e2e5]">
                  JoyID
                </span>
                <span className="block text-xs text-[#cbc3d7]">
                  Biometric Passkey (No Seed Phrase)
                </span>
              </div>
            </div>
            <span className="material-symbols-outlined text-[#494454] group-hover:text-[#d0bcff] transition-colors">
              chevron_right
            </span>
          </button>

          {/* Neuron */}
          <button
            onClick={handleWalletClick}
            className="w-full group flex items-center justify-between p-4 bg-[#1b1c1e] hover:bg-[#292a2c] transition-all duration-300 rounded-lg"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 flex items-center justify-center bg-[#03c6b2]/10 rounded-lg group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[#44e2cd] text-2xl">
                  terminal
                </span>
              </div>
              <div className="text-left">
                <span className="block font-['Space_Grotesk'] font-semibold text-[#e3e2e5]">
                  Neuron
                </span>
                <span className="block text-xs text-[#cbc3d7]">
                  CKB Full Node Desktop Wallet
                </span>
              </div>
            </div>
            <span className="material-symbols-outlined text-[#494454] group-hover:text-[#d0bcff] transition-colors">
              chevron_right
            </span>
          </button>

          {/* CCC */}
          <button
            onClick={handleWalletClick}
            className="w-full group flex items-center justify-between p-4 bg-[#1b1c1e] hover:bg-[#292a2c] transition-all duration-300 rounded-lg"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 flex items-center justify-center bg-[#494454]/20 rounded-lg group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-[#cbc3d7] text-2xl">
                  account_balance_wallet
                </span>
              </div>
              <div className="text-left">
                <span className="block font-['Space_Grotesk'] font-semibold text-[#e3e2e5]">
                  CCC
                </span>
                <span className="block text-xs text-[#cbc3d7]">
                  MetaMask / WalletConnect
                </span>
              </div>
            </div>
            <span className="material-symbols-outlined text-[#494454] group-hover:text-[#d0bcff] transition-colors">
              chevron_right
            </span>
          </button>
        </div>

        {/* Security Tip (Phala TEE) */}
        <div className="mt-4 px-8 py-6 bg-[#1f2022] border-t border-[#292a2c]/15">
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <span className="material-symbols-outlined text-[#ffb869] text-xl">
                verified_user
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-bold text-[#ffb869] uppercase tracking-widest font-['Space_Grotesk']">
                Why Connect?
              </p>
              <p className="text-xs leading-relaxed text-[#cbc3d7]">
                Connections are secured by{' '}
                <span className="text-[#e3e2e5] font-medium">
                  Phala TEE (Trusted Execution Environments)
                </span>
                . Your private keys never leave your device, and protocol
                interaction occurs within a mathematically isolated hardware
                enclave.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Action */}
        <div className="px-8 py-6 flex items-center justify-between bg-[#0d0e10]">
          <button className="text-xs text-[#cbc3d7] hover:text-[#d0bcff] transition-colors flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">
              help_outline
            </span>
            New to CKB?
          </button>
          <button
            onClick={onClose}
            className="text-xs font-['Space_Grotesk'] font-bold text-[#d0bcff] uppercase tracking-wider hover:opacity-80 transition-opacity"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* Decorative Aura */}
      <div className="fixed -z-10 w-[600px] h-[600px] bg-gradient-to-br from-[#d0bcff] to-[#a078ff] opacity-10 blur-[120px] rounded-full pointer-events-none" />
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
