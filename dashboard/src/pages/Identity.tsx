import { ccc } from '@ckb-ccc/connector-react';
import { useState } from 'react';
import { useAuth, getTwitterAuthUrl, getGithubAuthUrl } from '../hooks/useAuth';
import { useSystemStatus } from '../hooks/useSystemStatus';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import { config } from '../config';
import ActionLoadingOverlay from '../components/loading/ActionLoadingOverlay';

export default function Identity() {
  const { wallet, open } = ccc.useCcc();
  const {
    isWalletConnected,
    connections,
    identityCommitment,
    isLoading,
    isChecking,
    registrationError,
    registerWalletIdentity,
  } = useAuth();

  // Not connected
  if (!wallet) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-surface-container-low p-10 rounded-xl max-w-md text-center">
          <span className="material-symbols-outlined text-5xl text-primary mb-6 block">
            fingerprint
          </span>
          <h1 className="text-2xl font-headline font-bold text-on-surface mb-3">
            Connect Your Wallet
          </h1>
          <p className="text-sm text-on-surface-variant mb-8 leading-relaxed">
            Connect your CKB wallet to manage your account connections and view
            your identity commitment.
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

  // Checking identity with TEE
  if (isChecking) {
    return (
      <ActionLoadingOverlay
        isOpen={true}
        title="Loading Identity"
        description="Resolving your identity commitment from the Phala TEE enclave."
        steps={[
          { label: 'Wallet Connected', status: 'verified' },
          { label: 'Checking TEE Identity', status: 'processing' },
        ]}
      />
    );
  }

  return (
    <div className="relative overflow-hidden">
      {/* Background grid decoration */}
      <div className="absolute inset-0 technical-grid pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Hero Section — matches stitch identity HTML */}
        <header className="mb-12">
          <h2 className="font-headline text-3xl md:text-5xl font-bold tracking-tighter text-on-surface mb-2 leading-none">
            Linking Identities to the{' '}
            <span className="text-primary italic">Sovereign Enclave</span>
          </h2>
          <p className="text-on-surface-variant max-w-2xl text-base md:text-lg font-light leading-relaxed">
            Aggregating your digital reputation without compromising your
            anonymity. Powered by Phala Network TEEs on CKB.
          </p>
        </header>

        {/* Identity Registration Loading */}
        <ActionLoadingOverlay
          isOpen={isLoading && !identityCommitment}
          title="Registering Sovereign Identity"
          description="Sign the message in your wallet to verify ownership with the Phala TEE."
          steps={[
            { label: 'Awaiting Wallet Signature', status: 'processing' },
          ]}
        />

        {/* Not registered yet — show register button */}
        {!identityCommitment && !isLoading && (
          <div className="bg-[#1b1c1e] p-6 rounded-xl mb-8 border-l-2 border-[#d0bcff]">
            <div className="flex items-start gap-4">
              <span className="material-symbols-outlined text-[#d0bcff] text-2xl mt-0.5">
                shield_lock
              </span>
              <div className="flex-1">
                <h3 className="text-sm font-['Space_Grotesk'] font-bold text-[#e3e2e5] mb-1">
                  {registrationError ? 'Registration Failed' : 'Register Your Identity'}
                </h3>
                <p className="text-xs text-[#cbc3d7] mb-4 leading-relaxed">
                  {registrationError
                    ? registrationError
                    : 'Sign a message with your wallet to create your cryptographic identity commitment. This is a one-time action.'}
                </p>
                <button
                  onClick={registerWalletIdentity}
                  disabled={isLoading}
                  className="bg-transparent border border-[#d0bcff] text-[#d0bcff] font-bold py-2.5 px-6 rounded-lg text-sm transition-all hover:brightness-125 active:scale-95"
                >
                  {registrationError ? 'Retry Registration' : 'Register Identity'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Identity Commitment (Asymmetric Highlight) — matches stitch exactly */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16">
          <div className="lg:col-span-2 bg-surface-container-low p-6 md:p-8 relative overflow-hidden flex flex-col justify-between min-h-[320px]">
            <div className="absolute top-0 right-0 p-4">
              <span className="text-[10px] font-mono text-secondary tracking-[0.3em] uppercase">
                ENCLAVE_COMMITMENT
              </span>
            </div>
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary">
                    verified_user
                  </span>
                </div>
                <h3 className="font-headline text-2xl font-semibold">
                  Identity Commitment
                </h3>
              </div>
              <p className="text-on-surface-variant text-sm mb-8 leading-relaxed max-w-md">
                This cryptographic hash represents your total reputation score.
                It is the{' '}
                <span className="text-on-surface font-medium underline decoration-primary/40 underline-offset-4">
                  only
                </span>{' '}
                data point visible to public explorers.
              </p>
            </div>
            <div className="bg-surface-container-lowest p-4 md:p-6 border-l-4 border-primary">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-mono text-outline uppercase tracking-widest">
                  Protocol State Hash
                </span>
                <span className="text-[10px] font-mono text-secondary">
                  {identityCommitment ? 'VALIDATED' : 'PENDING'}
                </span>
              </div>
              <div className="font-mono text-xl md:text-2xl text-on-surface tracking-tight break-all">
                {identityCommitment ? (
                  <>
                    {identityCommitment.slice(0, 6)}
                    <span className="opacity-30">...</span>
                    {identityCommitment.slice(-10, -6)}
                    <span className="text-primary font-bold">
                      {identityCommitment.slice(-6)}
                    </span>
                  </>
                ) : (
                  <span className="text-on-surface-variant/40">
                    Awaiting registration...
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="bg-surface-container-highest p-6 md:p-8 flex flex-col justify-center border-l-2 border-outline-variant">
            <span className="material-symbols-outlined text-4xl text-tertiary mb-6">
              shield_lock
            </span>
            <h4 className="font-headline text-xl font-bold mb-4">
              Zero-Knowledge Proof
            </h4>
            <p className="text-sm text-on-surface-variant leading-relaxed">
              Every connection generates a unique ZK-proof within a Trusted
              Execution Environment (TEE). We never store your raw handles or
              passwords.
            </p>
            <div className="mt-8 flex gap-2">
              <span className="px-2 py-1 bg-surface-container-low text-[10px] font-mono rounded">
                TEE-v2.1
              </span>
              <span className="px-2 py-1 bg-surface-container-low text-[10px] font-mono rounded">
                PHALA-SGX
              </span>
            </div>
          </div>
        </section>

        {/* Connection Cards Grid — matches stitch exactly */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Twitter Card */}
          <ConnectionCard
            icon="alternate_email"
            name="Twitter"
            weight="12.5%"
            isConnected={connections.twitter}
            isWalletConnected={isWalletConnected}
            onConnect={() => {
              if (!config.twitterClientId) return;
              const callbackUrl = `${window.location.origin}/identity?auth=twitter`;
              window.location.href = getTwitterAuthUrl(callbackUrl);
            }}
            isConfigured={!!config.twitterClientId}
          />

          {/* GitHub Card */}
          <ConnectionCard
            icon="terminal"
            name="GitHub"
            weight="35.0%"
            isConnected={connections.github}
            isWalletConnected={isWalletConnected}
            onConnect={() => {
              if (!config.githubClientId) return;
              const callbackUrl = `${window.location.origin}/identity?auth=github`;
              window.location.href = getGithubAuthUrl(callbackUrl);
            }}
            isConfigured={!!config.githubClientId}
          />

          {/* CKB Wallet Card */}
          <ConnectionCard
            icon="account_balance_wallet"
            name="CKB Wallet"
            weight="52.5%"
            isConnected={connections.wallet}
            isWalletConnected={isWalletConnected}
            onConnect={() => {}}
            isConfigured={true}
          />
        </section>

        {/* Subtle Information Bar — live data from TEE health endpoint */}
        <IdentityFooter />
      </div>
    </div>
  );
}

/** Identity page footer showing live TEE status data */
function IdentityFooter() {
  const { protocolVersion, teeHealth, enclaveId, lastAttestation } =
    useSystemStatus();

  const versionLabel = protocolVersion
    ? `HAVEN_SECURITY_PROTOCOL: v${protocolVersion}`
    : 'HAVEN_SECURITY_PROTOCOL: --';

  const teeStatusLabel = teeHealth
    ? `TEE_STATUS: ${teeHealth.toUpperCase()}`
    : 'TEE_STATUS: --';

  const enclaveLabel = enclaveId ?? '--';

  const attestationLabel = lastAttestation
    ? formatRelativeTime(lastAttestation)
    : 'No attestation yet';

  return (
    <footer className="mt-16 flex flex-wrap items-center justify-between py-6 border-t border-outline-variant/20 gap-8">
      <div className="flex items-center gap-4">
        <span className="material-symbols-outlined text-secondary">
          gpp_maybe
        </span>
        <div className="text-[11px] text-on-surface-variant font-mono">
          {versionLabel}
          <br />
          <span className="text-outline">{teeStatusLabel}</span>
        </div>
      </div>
      <div className="flex items-center gap-8">
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-outline tracking-widest uppercase">
            Verified Enclave ID
          </span>
          <span className="text-[12px] font-mono text-on-surface">
            {enclaveLabel}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-outline tracking-widest uppercase">
            Last Attestation
          </span>
          <span className="text-[12px] font-mono text-on-surface">
            {attestationLabel}
          </span>
        </div>
      </div>
    </footer>
  );
}

/** Individual connection card component — matches stitch identity HTML exactly */
function ConnectionCard({
  icon,
  name,
  weight,
  isConnected,
  isWalletConnected,
  onConnect,
  isConfigured,
}: {
  icon: string;
  name: string;
  weight: string;
  isConnected: boolean;
  isWalletConnected: boolean;
  onConnect: () => void;
  isConfigured: boolean;
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnect = () => {
    if (isConnected || !isWalletConnected || !isConfigured) return;
    setIsLoading(true);
    onConnect();
  };

  return (
    <div className="bg-surface-container-low p-1 group hover:bg-surface-container-high transition-colors duration-300">
      <div
        className={`h-full flex flex-col p-6 ${
          isConnected
            ? 'border-t-2 border-primary'
            : 'border-t-2 border-outline-variant'
        }`}
      >
        <div className="flex justify-between items-start mb-8">
          <div className="w-12 h-12 bg-surface-container-highest flex items-center justify-center text-2xl">
            <span
              className={`material-symbols-outlined ${
                isConnected ? 'text-primary' : 'text-outline'
              }`}
            >
              {icon}
            </span>
          </div>
          {isConnected ? (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-secondary uppercase tracking-widest bg-secondary/10 px-2 py-1">
              <span className="w-1 h-1 rounded-full bg-secondary" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest bg-outline-variant/10 px-2 py-1">
              {isConfigured ? 'Not Connected' : 'Coming Soon'}
            </span>
          )}
        </div>

        <h4 className="font-headline text-xl font-bold mb-1">{name}</h4>
        <p className="text-xs text-outline mb-6">
          Reputation weight: {weight}
        </p>

        <div className="mt-auto">
          <p className="text-[10px] text-on-surface-variant mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-xs">info</span>
            Stored exclusively in TEE sealed storage
          </p>
          {isConnected ? (
            <div className="w-full bg-surface-container-highest text-secondary font-bold py-3 text-sm text-center border border-secondary/20">
              Linked
            </div>
          ) : isConfigured ? (
            <button
              onClick={handleConnect}
              disabled={!isWalletConnected || isLoading}
              className="w-full bg-transparent border border-[#d0bcff] text-[#d0bcff] font-bold py-3 text-sm active:scale-95 transition-all disabled:opacity-50"
            >
              {isLoading ? 'Redirecting...' : 'Link via Phala TEE'}
            </button>
          ) : (
            <button
              disabled
              className="w-full bg-surface-container-highest text-outline font-bold py-3 text-sm border border-outline-variant/30 opacity-50 cursor-not-allowed"
            >
              Link via Phala TEE
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
