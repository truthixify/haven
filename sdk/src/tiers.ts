/**
 * Tier metadata and UI helpers for Haven Protocol.
 *
 * Provides rich tier definitions with colors, descriptions, and icons
 * suitable for dashboard and dApp UI rendering. Also includes utility
 * functions for score formatting and progress calculation.
 */

import type { TierName } from './types';
import { TIER_THRESHOLDS } from './constants';

// ---------------------------------------------------------------------------
// TierDefinition type
// ---------------------------------------------------------------------------

/**
 * Complete tier definition with UI metadata.
 * Intended for rendering tier badges, progress bars, and info panels.
 */
export interface TierDefinition {
  /** Tier name identifier. */
  name: TierName;
  /** Minimum score for this tier (inclusive). */
  minScore: number;
  /** Maximum score for this tier (inclusive). */
  maxScore: number;
  /** Primary hex color for the tier. */
  color: string;
  /** Background hex color (subtle/transparent variant). */
  bgColor: string;
  /** Human-readable display label. */
  label: string;
  /** Description of what this tier unlocks. */
  description: string;
  /** Icon name for UI rendering (e.g. 'eye', 'shield', 'star', 'crown', 'gem'). */
  icon: string;
}

// ---------------------------------------------------------------------------
// Tier definitions
// ---------------------------------------------------------------------------

const TIER_DEFINITIONS: readonly TierDefinition[] = [
  {
    name: 'Observer',
    minScore: 0,
    maxScore: 199,
    color: '#6b7280',
    bgColor: '#6b72801a',
    label: 'Observer',
    description: 'Dashboard access, score tracking, basic platform features',
    icon: 'eye',
  },
  {
    name: 'Initiate',
    minScore: 200,
    maxScore: 399,
    color: '#3b82f6',
    bgColor: '#3b82f61a',
    label: 'Initiate',
    description: 'Funding pool participation, basic Haven Passes',
    icon: 'shield',
  },
  {
    name: 'Trusted',
    minScore: 400,
    maxScore: 649,
    color: '#10b981',
    bgColor: '#10b9811a',
    label: 'Trusted',
    description: 'Shadow Job Board, Alpha Whitelists, private channels',
    icon: 'star',
  },
  {
    name: 'Guardian',
    minScore: 650,
    maxScore: 849,
    color: '#a855f7',
    bgColor: '#a855f71a',
    label: 'Guardian',
    description: 'Governance voting, confidential AMAs, multiplier bonuses',
    icon: 'crown',
  },
  {
    name: 'Sovereign',
    minScore: 850,
    maxScore: 1000,
    color: '#f59e0b',
    bgColor: '#f59e0b1a',
    label: 'Sovereign',
    description: 'Full access, governance multiplier, exclusive funding pools',
    icon: 'gem',
  },
] as const;

// ---------------------------------------------------------------------------
// Lookup functions
// ---------------------------------------------------------------------------

/**
 * Get the tier definition for a given numeric score.
 *
 * Iterates from highest tier downward and returns the first match.
 *
 * @param score - Numeric score (0-1000).
 * @returns The TierDefinition for the matching tier.
 */
export function getTierDefinition(score: number): TierDefinition {
  for (let i = TIER_DEFINITIONS.length - 1; i >= 0; i--) {
    if (score >= TIER_DEFINITIONS[i]!.minScore) {
      return TIER_DEFINITIONS[i]!;
    }
  }
  return TIER_DEFINITIONS[0]!;
}

/**
 * Get all tier definitions in order from lowest to highest.
 *
 * @returns Array of all TierDefinition objects.
 */
export function getAllTierDefinitions(): TierDefinition[] {
  return [...TIER_DEFINITIONS];
}

// ---------------------------------------------------------------------------
// Progress helpers
// ---------------------------------------------------------------------------

/**
 * Result of a progress-to-next-tier calculation.
 */
export interface TierProgress {
  /** Current tier definition. */
  current: TierDefinition;
  /** Next tier definition, or `null` if already at Sovereign. */
  next: TierDefinition | null;
  /** Progress toward the next tier as a 0-100 percentage. */
  progress: number;
  /** Points needed to reach the next tier. 0 if already at max. */
  pointsNeeded: number;
}

/**
 * Calculate the user's progress toward the next tier.
 *
 * @param score - Current numeric score (0-1000).
 * @returns TierProgress object with current/next tier and progress percentage.
 */
export function getProgressToNextTier(score: number): TierProgress {
  const current = getTierDefinition(score);
  const currentIndex = TIER_DEFINITIONS.findIndex((t) => t.name === current.name);
  const next = currentIndex < TIER_DEFINITIONS.length - 1
    ? TIER_DEFINITIONS[currentIndex + 1]!
    : null;

  if (!next) {
    return {
      current,
      next: null,
      progress: 100,
      pointsNeeded: 0,
    };
  }

  const range = next.minScore - current.minScore;
  const elapsed = score - current.minScore;
  const progress = range > 0 ? Math.min(100, Math.max(0, (elapsed / range) * 100)) : 0;
  const pointsNeeded = Math.max(0, next.minScore - score);

  return {
    current,
    next,
    progress,
    pointsNeeded,
  };
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

/**
 * Format a Haven Score for display.
 *
 * @param score - Numeric score (0-1000).
 * @returns Formatted score string.
 */
export function formatScore(score: number): string {
  return score.toString();
}

/**
 * Truncate a hex hash for display.
 *
 * @param hash  - Full hex hash string.
 * @param chars - Number of characters to show at each end. Defaults to 6.
 * @returns Truncated string like "0xabcdef...123456".
 */
export function truncateHash(hash: string, chars: number = 6): string {
  if (hash.length <= chars * 2 + 2) return hash;
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}
