import { useState, useEffect, useCallback, useRef } from 'react';
import { HavenTeeClient } from '@haven-protocol/ckb-sdk/tee';
import type { TeeHealthStatus } from '@haven-protocol/ckb-sdk/tee';
import { config } from '../config';

/** How often we poll the TEE health endpoint (ms). */
const HEALTH_POLL_INTERVAL = 30_000;

/** How often we poll the CKB RPC for the tip block number (ms). */
const BLOCK_POLL_INTERVAL = 15_000;

interface SystemStatus {
  /** TEE health status: online, degraded, or offline. */
  teeHealth: TeeHealthStatus['teeHealth'] | null;
  /** Enclave instance ID from dstack. */
  enclaveId: string | null;
  /** ISO timestamp of the last TEE attestation quote. */
  lastAttestation: string | null;
  /** Protocol version string from the TEE service. */
  protocolVersion: string | null;
  /** TEE process uptime in seconds. */
  uptime: number | null;
  /** Latest CKB tip block number. */
  ckbBlockNumber: number | null;
  /** True when the TEE is reachable. */
  isOnline: boolean;
}

const teeClient = new HavenTeeClient(config.teeEndpoint);

/**
 * Hook that polls the TEE health endpoint and CKB RPC for live system data.
 *
 * Used by Footer, Identity, and Dashboard pages to replace hardcoded values.
 */
export function useSystemStatus(): SystemStatus {
  const [health, setHealth] = useState<TeeHealthStatus | null>(null);
  const [ckbBlockNumber, setCkbBlockNumber] = useState<number | null>(null);
  const [isOnline, setIsOnline] = useState(false);

  // Refs to avoid stale closures in interval callbacks
  const healthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- TEE health polling ----
  const fetchHealth = useCallback(async () => {
    try {
      const data = await teeClient.getHealth();
      setHealth(data);
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    }
  }, []);

  // ---- CKB block number polling ----
  const fetchBlockNumber = useCallback(async () => {
    try {
      const response = await fetch(config.ckbRpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: 1,
          jsonrpc: '2.0',
          method: 'get_tip_block_number',
          params: [],
        }),
      });
      const data = await response.json();
      const blockNum = parseInt(data.result, 16);
      if (!Number.isNaN(blockNum)) {
        setCkbBlockNumber(blockNum);
      }
    } catch {
      // Silently ignore — we keep the last known value
    }
  }, []);

  useEffect(() => {
    // Fetch immediately on mount
    fetchHealth();
    fetchBlockNumber();

    // Set up polling intervals
    healthTimerRef.current = setInterval(fetchHealth, HEALTH_POLL_INTERVAL);
    blockTimerRef.current = setInterval(fetchBlockNumber, BLOCK_POLL_INTERVAL);

    return () => {
      if (healthTimerRef.current) clearInterval(healthTimerRef.current);
      if (blockTimerRef.current) clearInterval(blockTimerRef.current);
    };
  }, [fetchHealth, fetchBlockNumber]);

  return {
    teeHealth: health?.teeHealth ?? null,
    enclaveId: health?.enclaveId ?? null,
    lastAttestation: health?.lastAttestation ?? null,
    protocolVersion: health?.protocolVersion ?? null,
    uptime: health?.uptime ?? null,
    ckbBlockNumber,
    isOnline,
  };
}
