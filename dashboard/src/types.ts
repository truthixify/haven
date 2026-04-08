/**
 * Dashboard-specific UI types.
 *
 * All Haven domain types (HavenScore, ScoreBreakdown, TierName,
 * LeaderboardEntry, etc.) are imported from the SDK:
 *
 *   import type { HavenScore, TierName } from '@haven-protocol-ckb/sdk';
 *
 * This file only contains types that are specific to the dashboard UI layer.
 */

import type { ScoreBreakdown } from '@haven-protocol-ckb/sdk';

/** Score history point used for the dashboard chart. */
export interface ScoreHistoryPoint {
  epoch: number;
  score: number;
  breakdown: ScoreBreakdown;
  timestamp: number;
}

/** Auth connection status for the settings page. */
export interface ConnectionStatus {
  twitter: boolean;
  github: boolean;
  wallet: boolean;
}

/** Deposit history entry for the deposit card. */
export interface DepositHistoryEntry {
  type: 'deposit' | 'fee';
  amount: bigint;
  epoch: number;
  txHash: string;
  timestamp: number;
}

/** Leaderboard sort field options. */
export type LeaderboardSortField = 'score' | 'privacy' | 'contribution' | 'humanity' | 'community';

/** Sort direction. */
export type SortDirection = 'asc' | 'desc';
