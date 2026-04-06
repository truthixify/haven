import { OnChainActivity } from '../../common/types';
import { COMPONENT_MAX } from '../../common/constants';

/**
 * Privacy Hygiene Formula (40% weight, max 400 points)
 *
 * Measures how well a user practices on-chain privacy.
 *
 * Reweighted to produce non-zero scores from basic CKB testnet activity,
 * since shielded pool and privacy protocol features don't yet exist on testnet:
 * - Address rotation patterns (40% of component)
 * - Transaction pattern diversity (30% of component)
 * - Total transactions (20% of component)
 * - Account age (10% of component)
 *
 * All sub-scores use sigmoid-like normalization to reward
 * genuine usage while capping the benefit of extreme values.
 */

const MAX_SCORE = COMPONENT_MAX.PRIVACY_HYGIENE; // 400

/**
 * Sub-component weights within the privacy hygiene score.
 * Weighted toward signals that are available from basic CKB activity.
 */
const WEIGHTS = {
  ADDRESS_ROTATION: 0.40,
  TRANSACTION_DIVERSITY: 0.30,
  TOTAL_TRANSACTIONS: 0.20,
  ACCOUNT_AGE: 0.10,
} as const;

/**
 * Sigmoid normalization: maps a raw value to [0, 1] with diminishing returns.
 * f(x) = x / (x + k), where k is the half-saturation constant.
 *
 * When x = k, the output is 0.5 (half of maximum).
 * Provides smooth diminishing returns - doubling effort from k to 2k
 * only gains ~0.17 more points.
 */
function sigmoid(value: number, halfSaturation: number): number {
  if (value <= 0) return 0;
  return value / (value + halfSaturation);
}

/**
 * Compute the address rotation sub-score.
 *
 * Rewards users who rotate addresses rather than reusing a single address.
 * Good privacy hygiene means using fresh addresses for different purposes.
 *
 * Half-saturation at 8 rotations: a user who has used 8 distinct addresses
 * gets 50% of this sub-component's maximum.
 */
function scoreAddressRotation(rotations: number): number {
  return sigmoid(rotations, 8) * WEIGHTS.ADDRESS_ROTATION * MAX_SCORE;
}

/**
 * Compute the transaction pattern diversity sub-score.
 *
 * Rewards diverse on-chain activity patterns. Uses a composite of:
 * - Number of unique addresses interacted with
 * - Ratio of recent to total transactions (activity consistency)
 * - Cell count diversity
 */
function scoreTransactionDiversity(activity: OnChainActivity): number {
  // Unique addresses: half-saturation at 15
  const addressScore = sigmoid(activity.uniqueAddressesUsed, 15);

  // Activity consistency: ratio of recent (30-day) to total transactions
  // Rewards users who are consistently active, not just burst activity.
  const consistencyRatio =
    activity.totalTransactions > 0
      ? Math.min(activity.recentTransactions / activity.totalTransactions, 1)
      : 0;
  // Optimal consistency is around 0.1-0.3 (healthy ongoing activity)
  // Very high ratios (>0.8) suggest new accounts, very low suggest dormant.
  const consistencyScore =
    consistencyRatio > 0 ? sigmoid(consistencyRatio * 10, 3) : 0;

  // Cell diversity: half-saturation at 10 cells
  const cellScore = sigmoid(activity.cellCount, 10);

  // Weighted average of the three diversity signals
  const composite =
    addressScore * 0.4 + consistencyScore * 0.3 + cellScore * 0.3;

  return composite * WEIGHTS.TRANSACTION_DIVERSITY * MAX_SCORE;
}

/**
 * Compute the total transactions sub-score.
 *
 * Rewards users who have meaningful transaction history on-chain.
 * Half-saturation at 20 transactions: a user with 20 txs gets 50%.
 */
function scoreTotalTransactions(totalTxs: number): number {
  return sigmoid(totalTxs, 20) * WEIGHTS.TOTAL_TRANSACTIONS * MAX_SCORE;
}

/**
 * Compute the account age sub-score.
 *
 * Rewards accounts that have been active for a longer period.
 * Half-saturation at 90 days (~3 months).
 */
function scoreAccountAge(ageDays: number): number {
  return sigmoid(ageDays, 90) * WEIGHTS.ACCOUNT_AGE * MAX_SCORE;
}

/**
 * Compute the full Privacy Hygiene score.
 *
 * @param activity - On-chain activity data collected by the on-chain collector
 * @returns Privacy hygiene score, 0 to 400 (integer)
 */
export function computePrivacyHygieneScore(
  activity: OnChainActivity,
): number {
  const rotation = scoreAddressRotation(activity.addressRotationCount);
  const diversity = scoreTransactionDiversity(activity);
  const totalTxs = scoreTotalTransactions(activity.totalTransactions);
  const age = scoreAccountAge(activity.accountAgeDays);

  const total = rotation + diversity + totalTxs + age;

  // Clamp to integer in valid range
  return Math.min(Math.max(Math.round(total), 0), MAX_SCORE);
}
