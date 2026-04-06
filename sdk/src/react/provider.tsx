/**
 * HavenProvider — React context provider for the Haven SDK.
 *
 * Initializes a HavenClient from a CCC client and makes it available
 * to all child components via React context.
 *
 * Usage:
 * ```tsx
 * import { ccc } from '@ckb-ccc/core';
 * import { HavenProvider } from '@haven-protocol/ckb-sdk/react';
 *
 * const cccClient = new ccc.ClientPublicTestnet();
 *
 * function App() {
 *   return (
 *     <HavenProvider client={cccClient}>
 *       <MyDApp />
 *     </HavenProvider>
 *   );
 * }
 * ```
 */

import React, { createContext, useContext, useMemo } from 'react';
import type { ccc } from '@ckb-ccc/core';
import { HavenClient } from '../client';
import type { HavenClientOptions } from '../types';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const HavenContext = createContext<HavenClient | null>(null);

/**
 * Access the HavenClient from context.
 * Throws if used outside a <HavenProvider>.
 */
export function useHavenClient(): HavenClient {
  const client = useContext(HavenContext);
  if (!client) {
    throw new Error(
      'useHavenClient must be used within a <HavenProvider>. ' +
        'Wrap your component tree with <HavenProvider client={cccClient}>.',
    );
  }
  return client;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface HavenProviderProps {
  /** CCC client instance (e.g. new ccc.ClientPublicTestnet()). */
  client: ccc.Client;
  /** Optional HavenClient configuration overrides. */
  options?: HavenClientOptions;
  /** Child components. */
  children: React.ReactNode;
}

/**
 * React context provider that initializes a HavenClient and makes it
 * available to all descendant components via the useHavenClient hook.
 *
 * The HavenClient is memoized and only recreated when the CCC client
 * or options reference changes.
 */
export function HavenProvider({ client, options, children }: HavenProviderProps) {
  const havenClient = useMemo(
    () => new HavenClient(client, options),
    [client, options],
  );

  return (
    <HavenContext.Provider value={havenClient}>
      {children}
    </HavenContext.Provider>
  );
}
