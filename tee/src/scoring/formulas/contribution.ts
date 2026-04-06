import { GitHubActivity, OnChainActivity } from '../../common/types';
import { COMPONENT_MAX } from '../../common/constants';

/**
 * Ecosystem Contribution Formula (30% weight, max 300 points)
 *
 * Measures contributions to the privacy/ZK ecosystem.
 *
 * Reweighted so on-chain activity counts more when no GitHub is linked.
 * When GitHub IS linked, the original GitHub-heavy weights still apply
 * via a blended approach. When GitHub is NOT linked, on-chain activity
 * fills the entire score:
 * - Total transactions (40% of component)
 * - DAO deposits / governance (30% of component)
 * - Cell count / on-chain presence (20% of component)
 * - Recent activity (10% of component)
 *
 * When GitHub IS linked:
 * - GitHub commits to privacy/ZK repositories (30%)
 * - Pull requests and issue activity (15%)
 * - On-chain governance + DAO (25%)
 * - On-chain transaction activity (20%)
 * - Organizational contributions (10%)
 */

const MAX_SCORE = COMPONENT_MAX.ECOSYSTEM_CONTRIBUTION; // 300

/**
 * Sigmoid normalization with configurable half-saturation.
 */
function sigmoid(value: number, halfSaturation: number): number {
  if (value <= 0) return 0;
  return value / (value + halfSaturation);
}

/**
 * Compute on-chain-only contribution score (when no GitHub is linked).
 */
function computeOnchainOnlyScore(onchain: OnChainActivity): number {
  // Total transactions: half-saturation at 30
  const txScore = sigmoid(onchain.totalTransactions, 30) * 0.40 * MAX_SCORE;

  // DAO deposits: half-saturation at 3
  const daoScore = sigmoid(onchain.daoDeposits, 3) * 0.30 * MAX_SCORE;

  // Cell count / on-chain presence: half-saturation at 10
  const cellScore = sigmoid(onchain.cellCount, 10) * 0.20 * MAX_SCORE;

  // Recent activity: half-saturation at 10 recent txs
  const recentScore =
    sigmoid(onchain.recentTransactions, 10) * 0.10 * MAX_SCORE;

  return txScore + daoScore + cellScore + recentScore;
}

/**
 * Compute blended contribution score (when GitHub IS linked).
 */
function computeBlendedScore(
  github: GitHubActivity,
  onchain: OnChainActivity,
): number {
  // GitHub privacy/ZK commits: half-saturation at 200
  const combined =
    github.privacyRepoCommits + github.zkRepoCommits * 1.5;
  const privacyCommits = sigmoid(combined, 200) * 0.30 * MAX_SCORE;

  // PRs and issues: half-saturation at 20
  const prIssues =
    sigmoid(github.pullRequestCount * 2 + github.issueCount, 20) *
    0.15 *
    MAX_SCORE;

  // On-chain governance (DAO + general activity)
  const daoGovernance = sigmoid(onchain.daoDeposits, 5) * 0.6;
  const activityGovernance = sigmoid(onchain.totalTransactions, 50) * 0.4;
  const governance = (daoGovernance + activityGovernance) * 0.25 * MAX_SCORE;

  // On-chain transaction activity
  const txActivity =
    sigmoid(onchain.totalTransactions, 30) * 0.20 * MAX_SCORE;

  // Organizational contributions: half-saturation at 3
  const orgContribs =
    sigmoid(github.contributedToOrgs, 3) * 0.10 * MAX_SCORE;

  return privacyCommits + prIssues + governance + txActivity + orgContribs;
}

/**
 * Compute the full Ecosystem Contribution score.
 *
 * @param github - GitHub activity data (may be undefined if not linked)
 * @param onchain - On-chain activity data
 * @returns Contribution score, 0 to 300 (integer)
 */
export function computeContributionScore(
  github: GitHubActivity | undefined,
  onchain: OnChainActivity,
): number {
  const total = github
    ? computeBlendedScore(github, onchain)
    : computeOnchainOnlyScore(onchain);

  return Math.min(Math.max(Math.round(total), 0), MAX_SCORE);
}
