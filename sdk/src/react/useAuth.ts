/**
 * useAuth — React hook for Haven authentication state management.
 *
 * Manages wallet connection status, identity registration, and
 * TEE connection status in a single hook.
 *
 * Usage:
 * ```tsx
 * import { HavenTeeClient } from '@haven-protocol/ckb-sdk/tee';
 * import { useAuth } from '@haven-protocol/ckb-sdk/react';
 *
 * const teeClient = new HavenTeeClient('http://localhost:3000/api');
 *
 * function AuthPanel() {
 *   const auth = useAuth(teeClient);
 *
 *   if (auth.isLoading) return <div>Loading...</div>;
 *   if (!auth.isWalletConnected) return <div>Connect your wallet first</div>;
 *
 *   return (
 *     <div>
 *       <p>Address: {auth.address}</p>
 *       <p>Twitter: {auth.connections?.twitter ? 'Connected' : 'Not connected'}</p>
 *       <button onClick={auth.registerIdentity}>Register Identity</button>
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import type { HavenTeeClient } from '../tee/client';
import type { ConnectionStatus } from '../tee/types';

export interface UseAuthResult {
  /** Whether a wallet is currently connected. */
  isWalletConnected: boolean;
  /** The connected wallet address, or null. */
  address: string | null;
  /** The user's identity commitment from the TEE, or null. */
  identityCommitment: string | null;
  /** TEE connection status (wallet, twitter, github). */
  connections: ConnectionStatus | null;
  /** Whether any auth operation is in progress. */
  isLoading: boolean;
  /** Register the wallet identity with the TEE. Requires signer, address, and message. */
  registerIdentity: (
    pubKey: string,
    address: string,
    signature: string,
    message: string,
  ) => Promise<void>;
  /** Refresh connection status from the TEE. */
  refreshConnections: () => Promise<void>;
}

/**
 * React hook for managing Haven authentication state.
 *
 * Provides identity registration, connection status polling, and
 * wallet state tracking via the HavenTeeClient.
 *
 * @param teeClient - A HavenTeeClient instance.
 * @param initialAddress - Optional initial wallet address (if already connected).
 * @param initialIdentityCommitment - Optional initial identity commitment (if already registered).
 * @returns Auth state and action functions.
 */
export function useAuth(
  teeClient: HavenTeeClient,
  initialAddress?: string | null,
  initialIdentityCommitment?: string | null,
): UseAuthResult {
  const [isWalletConnected, setIsWalletConnected] = useState(!!initialAddress);
  const [address, setAddress] = useState<string | null>(initialAddress ?? null);
  const [identityCommitment, setIdentityCommitment] = useState<string | null>(
    initialIdentityCommitment ?? null,
  );
  const [connections, setConnections] = useState<ConnectionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Sync external address changes
  useEffect(() => {
    setIsWalletConnected(!!initialAddress);
    setAddress(initialAddress ?? null);
    if (!initialAddress) {
      setIdentityCommitment(null);
      setConnections(null);
    }
  }, [initialAddress]);

  // Sync external identity commitment changes
  useEffect(() => {
    if (initialIdentityCommitment !== undefined) {
      setIdentityCommitment(initialIdentityCommitment ?? null);
    }
  }, [initialIdentityCommitment]);

  // Fetch connections when identity commitment is available
  const refreshConnections = useCallback(async () => {
    if (!identityCommitment) return;

    setIsLoading(true);
    try {
      const status = await teeClient.getConnectionStatus(identityCommitment);
      setConnections(status);
    } catch {
      // Keep existing connections on failure
    } finally {
      setIsLoading(false);
    }
  }, [teeClient, identityCommitment]);

  // Auto-fetch connections when identity commitment changes
  useEffect(() => {
    if (identityCommitment) {
      refreshConnections();
    }
  }, [identityCommitment, refreshConnections]);

  // Register identity
  const registerIdentity = useCallback(
    async (
      pubKey: string,
      addr: string,
      signature: string,
      message: string,
    ) => {
      setIsLoading(true);
      try {
        const result = await teeClient.registerIdentity(addr, pubKey, signature, message);
        setIdentityCommitment(result.identityCommitment);
        setIsWalletConnected(true);
        setAddress(addr);
      } finally {
        setIsLoading(false);
      }
    },
    [teeClient],
  );

  return {
    isWalletConnected,
    address,
    identityCommitment,
    connections,
    isLoading,
    registerIdentity,
    refreshConnections,
  };
}
