/**
 * Deposit helpers for Haven Protocol.
 *
 * Utilities for estimating update capacity, checking low balances,
 * and formatting CKB amounts from shannons.
 */

/** 1 CKByte = 10^8 shannons */
const SHANNONS_PER_CKB = 100_000_000n;

/**
 * Estimate how many score updates remain given the current deposit
 * balance and the per-update fee.
 *
 * @param depositBalance - Current deposit balance in shannons.
 * @param perUpdateFee   - Fee per update in shannons.
 * @returns Number of updates remaining (integer, floored).
 */
export function estimateUpdatesRemaining(
  depositBalance: bigint,
  perUpdateFee: bigint,
): number {
  if (perUpdateFee <= 0n) return 0;
  return Number(depositBalance / perUpdateFee);
}

/**
 * Check whether the deposit balance is below a low-balance threshold.
 *
 * @param depositBalance - Current deposit balance in shannons.
 * @param threshold      - Threshold in shannons. Defaults to 20 CKB (20_0000_0000 shannons).
 * @returns `true` if the balance is at or below the threshold.
 */
export function isLowBalance(
  depositBalance: bigint,
  threshold: bigint = 20n * SHANNONS_PER_CKB,
): boolean {
  return depositBalance <= threshold;
}

/**
 * Format a shannon amount as a human-readable CKB string.
 *
 * - Values >= 1,000,000 CKB are formatted as "1.23M CKB"
 * - Values >= 1,000 CKB are formatted as "1.23K CKB"
 * - Smaller values are formatted as "123.45 CKB"
 *
 * @param shannons - Amount in shannons (1 CKB = 10^8 shannons).
 * @returns Formatted string with CKB suffix.
 */
export function formatCkbAmount(shannons: bigint): string {
  const ckb = Number(shannons) / Number(SHANNONS_PER_CKB);

  if (ckb >= 1_000_000) {
    return `${(ckb / 1_000_000).toFixed(2)}M CKB`;
  }
  if (ckb >= 1_000) {
    return `${(ckb / 1_000).toFixed(2)}K CKB`;
  }
  return `${ckb.toFixed(2)} CKB`;
}
