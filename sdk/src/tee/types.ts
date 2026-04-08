/**
 * Types for the Haven TEE client.
 *
 * These types describe the TEE service API surface — connection status,
 * client options, and response shapes.
 */

/**
 * Connection status returned by the TEE service.
 * Booleans only — no real account IDs or tokens are ever exposed.
 */
export interface ConnectionStatus {
  wallet: boolean;
  twitter: boolean;
  github: boolean;
  identityCommitment: string | null;
}

/**
 * Options for constructing a HavenTeeClient.
 */
export interface TeeClientOptions {
  /** Base URL of the TEE NestJS service (e.g. "http://localhost:3000/api"). */
  endpoint: string;
  /** Request timeout in milliseconds. Defaults to 30000 (30s). */
  timeout?: number;
}

/**
 * Health status returned by GET /api/health.
 */
export interface TeeHealthStatus {
  teeHealth: 'online' | 'degraded' | 'offline';
  enclaveId: string;
  lastAttestation: string | null;
  protocolVersion: string;
  uptime: number;
}

/**
 * A single entry in a user's score history.
 */
export interface ScoreHistoryEntry {
  epoch: number;
  score: number;
  privacy: number;
  contribution: number;
  humanity: number;
  community: number;
  txHash: string | null;
  createdAt: string;
}

/**
 * A notification from the Haven TEE service.
 */
export interface HavenNotification {
  id: string;
  type: 'score_update' | 'deposit_low' | 'tier_change' | 'epoch_complete' | 'system';
  title: string;
  message: string;
  read: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
}
