/**
 * Haven Protocol React hooks.
 *
 * Provides React-friendly wrappers around the HavenClient for
 * score fetching, threshold gating, leaderboard display, auth
 * management, and deposit operations.
 *
 * Usage:
 * ```tsx
 * import {
 *   HavenProvider,
 *   useHavenScore,
 *   useHavenGate,
 *   useLeaderboard,
 *   useAuth,
 *   useDeposit,
 * } from '@haven-protocol/ckb-sdk/react';
 * ```
 */

export { HavenProvider, useHavenClient, type HavenProviderProps } from './provider';
export { useHavenScore, type UseHavenScoreResult } from './useHavenScore';
export { useHavenGate, type UseHavenGateResult } from './useHavenGate';
export {
  useLeaderboard,
  type UseLeaderboardOptions,
  type UseLeaderboardResult,
} from './useLeaderboard';
export { useAuth, type UseAuthResult } from './useAuth';
export { useDeposit, type UseDepositOptions, type UseDepositResult } from './useDeposit';
export { useNotifications, type UseNotificationsResult } from './useNotifications';
