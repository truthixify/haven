import { useState, useEffect, useCallback, useRef } from 'react';
import { useSigner } from '@ckb-ccc/connector-react';
import { HavenTeeClient } from '@haven-protocol-ckb/sdk/tee';
import type { ConnectionStatus } from '../types';
import { config } from '../config';

interface AuthState {
  isWalletConnected: boolean;
  address: string | null;
  connections: ConnectionStatus;
  identityCommitment: string | null;
  isLoading: boolean;
  isChecking: boolean;
  registrationError: string | null;
}

const teeClient = new HavenTeeClient(config.teeEndpoint);

/**
 * Auth hook — wallet connection + identity management.
 *
 * Identity flow:
 * 1. Wallet connects → get pubkey via signer.getIdentity() (no signing)
 * 2. Ask TEE: "is this pubkey registered?" via /identity/commitment + /identity/check
 * 3. If registered → use the existing commitment, no user action needed
 * 4. If not registered → show "Register" button, user signs once
 * 5. TEE stores record, returns deterministic commitment = Blake2b(pubkey)
 *
 * Same wallet = same commitment, always. Works across browsers/devices.
 */
export function useAuth() {
  const signer = useSigner();
  const checkedRef = useRef<string | null>(null);

  const [state, setState] = useState<AuthState>({
    isWalletConnected: false,
    address: null,
    connections: { twitter: false, github: false, discord: false, linkedin: false, wallet: false },
    identityCommitment: null,
    isLoading: false,
    isChecking: !!signer,
    registrationError: null,
  });

  // When wallet connects: resolve address + check TEE for existing identity
  useEffect(() => {
    let cancelled = false;

    async function syncWallet() {
      if (!signer) {
        checkedRef.current = null;
        if (!cancelled) {
          setState({
            isWalletConnected: false,
            address: null,
            connections: { twitter: false, github: false, discord: false, linkedin: false, wallet: false },
            identityCommitment: null,
            isLoading: false,
            isChecking: false,
            registrationError: null,
          });
        }
        return;
      }

      // Mark as checking while we resolve identity
      if (!cancelled) {
        setState((prev) => ({ ...prev, isChecking: true }));
      }

      try {
        const addressObj = await signer.getRecommendedAddressObj();
        const addr = addressObj.toString();
        if (cancelled || !addr) return;

        setState((prev) => ({
          ...prev,
          isWalletConnected: true,
          address: addr,
          connections: { ...prev.connections, wallet: true },
        }));

        // Skip if we already checked this address
        if (checkedRef.current === addr) return;
        checkedRef.current = addr;

        // Get the signer's identity (pubkey) — no signing needed
        const identity = await signer.getIdentity();
        if (cancelled || !identity) return;

        // Ask TEE to compute the commitment for this pubkey
        try {
          const { identityCommitment } = await teeClient.getCommitment(identity);

          // Check if this commitment is registered in sealed storage
          const { registered } = await teeClient.checkIdentity(identityCommitment);

          if (!cancelled) {
            setState((prev) => ({
              ...prev,
              isChecking: false,
              ...(registered
                ? { identityCommitment, connections: { ...prev.connections, wallet: true } }
                : {}),
            }));
          }
        } catch {
          // TEE unreachable — check localStorage fallback
          try {
            const cached = localStorage.getItem(`haven_identity_${addr}`);
            if (!cancelled) {
              setState((prev) => ({
                ...prev,
                isChecking: false,
                ...(cached ? { identityCommitment: cached } : {}),
              }));
            }
          } catch {
            if (!cancelled) setState((prev) => ({ ...prev, isChecking: false }));
          }
        }
      } catch {
        if (!cancelled) {
          setState((prev) => ({ ...prev, isWalletConnected: false, address: null, isChecking: false }));
        }
      }
    }

    syncWallet();
    return () => { cancelled = true; };
  }, [signer]);

  // Fetch connection status from TEE when we have an identity
  useEffect(() => {
    if (!state.identityCommitment) return;
    let cancelled = false;

    teeClient.getConnectionStatus(state.identityCommitment).then((status) => {
      if (!cancelled) {
        setState((prev) => ({
          ...prev,
          connections: {
            wallet: status.wallet ?? true,
            twitter: status.twitter ?? false,
            github: status.github ?? false,
            discord: (status as any).discord ?? false,
            linkedin: (status as any).linkedin ?? false,
          },
        }));
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [state.identityCommitment]);

  // Handle OAuth callbacks from URL
  useEffect(() => {
    const url = new URL(window.location.href);
    const authType = url.searchParams.get('auth');
    const code = url.searchParams.get('code');
    const oauthState = url.searchParams.get('state');

    if (!authType || !code || !oauthState || !state.identityCommitment) return;

    (async () => {
      try {
        if (authType === 'twitter') {
          await teeClient.completeTwitterAuth(state.identityCommitment!, code!, oauthState!);
        } else if (authType === 'github') {
          await teeClient.completeGithubAuth(state.identityCommitment!, code!, oauthState!);
        }
        const status = await teeClient.getConnectionStatus(state.identityCommitment!);
        setState((prev) => ({
          ...prev,
          connections: {
            wallet: status.wallet ?? true,
            twitter: status.twitter ?? false,
            github: status.github ?? false,
            discord: (status as any).discord ?? false,
            linkedin: (status as any).linkedin ?? false,
          },
        }));
      } catch (err) {
        console.error('OAuth callback failed:', err);
      }

      url.searchParams.delete('auth');
      url.searchParams.delete('code');
      url.searchParams.delete('state');
      window.history.replaceState({}, '', url.pathname + url.search);
    })();
  }, [state.identityCommitment]);

  /**
   * Register identity — one-time action per wallet.
   * User signs a message to prove ownership, TEE stores the record.
   * After this, the wallet is recognized automatically on any device.
   */
  const registerWalletIdentity = useCallback(async () => {
    if (!signer || !state.address) return null;

    setState((prev) => ({ ...prev, isLoading: true, registrationError: null }));

    try {
      const message = `Haven Protocol Identity\nAddress: ${state.address}`;
      const sig = await signer.signMessage(message);

      // Get the actual lock script from the signer for on-chain scoring
      const addressObj = await signer.getRecommendedAddressObj();
      const lockScript = addressObj.script;

      const result = await teeClient.registerIdentity(
        state.address,
        sig.identity,
        sig.signature,
        message,
        {
          lockCodeHash: lockScript.codeHash,
          lockHashType: lockScript.hashType,
          lockArgs: lockScript.args,
        },
      );

      // Cache for offline/fast access
      try {
        localStorage.setItem(`haven_identity_${state.address}`, result.identityCommitment);
      } catch {}

      setState((prev) => ({
        ...prev,
        identityCommitment: result.identityCommitment,
        connections: { ...prev.connections, wallet: true },
        isLoading: false,
      }));
      return result;
    } catch (err) {
      console.error('Identity registration failed:', err);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        registrationError: err instanceof Error ? err.message : 'Registration failed',
      }));
      return null;
    }
  }, [signer, state.address]);

  return {
    ...state,
    registerWalletIdentity,
    teeClient,
  };
}

export function getTwitterAuthUrl(callbackUrl: string): string {
  return teeClient.getTwitterAuthUrl(callbackUrl);
}

export function getGithubAuthUrl(callbackUrl: string): string {
  return teeClient.getGithubAuthUrl(callbackUrl);
}
