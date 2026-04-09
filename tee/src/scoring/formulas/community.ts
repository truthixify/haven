import {
  DiscordActivity,
  LinkedInActivity,
  TwitterActivity,
  GitHubActivity,
  OnChainActivity,
} from '../../common/types';
import { COMPONENT_MAX } from '../../common/constants';

/**
 * Community Engagement Formula (10% weight, max 100 points)
 *
 * Measures active participation in the community.
 *
 * Reweighted to produce non-zero scores from CKB-only on-chain activity:
 * - On-chain interaction diversity (50% of component)
 * - Recent transactions / activity (30% of component)
 * - Cell management / presence (20% of component)
 *
 * When social platforms ARE linked, their signals blend in and boost the score.
 */

const MAX_SCORE = COMPONENT_MAX.COMMUNITY_ENGAGEMENT; // 100

function sigmoid(value: number, halfSaturation: number): number {
  if (value <= 0) return 0;
  return value / (value + halfSaturation);
}

/**
 * Score on-chain interaction diversity.
 *
 * Rewards users who interact with diverse parts of the CKB ecosystem:
 * - Unique addresses/transactions
 * - DAO participation
 * - Multiple activity types
 *
 * When social platforms are linked, their participation signals blend in.
 */
function scoreInteractionDiversity(
  twitter: TwitterActivity | undefined,
  github: GitHubActivity | undefined,
  discord: DiscordActivity | undefined,
  _linkedin: LinkedInActivity | undefined,
  onchain: OnChainActivity,
): number {
  let score = 0;
  let components = 0;

  components++;
  const addressDiversity = sigmoid(onchain.uniqueAddressesUsed, 15);
  const activityTypes = [
    onchain.totalTransactions > 0,
    onchain.daoDeposits > 0,
    onchain.cellCount > 3,
    onchain.addressRotationCount > 2,
    onchain.recentTransactions > 0,
  ];
  const typeDiversity = activityTypes.filter(Boolean).length / activityTypes.length;
  score += addressDiversity * 0.6 + typeDiversity * 0.4;

  if (twitter) {
    components++;
    const replyScore = sigmoid(twitter.recentReplies, 10);
    const likeScore = sigmoid(twitter.recentLikes, 20);
    const retweetScore = sigmoid(twitter.recentRetweets, 8);
    score += replyScore * 0.5 + likeScore * 0.25 + retweetScore * 0.25;
  }

  if (github) {
    components++;
    const issueScore = sigmoid(github.issueCount, 5);
    const prScore = sigmoid(github.pullRequestCount, 5);
    score += issueScore * 0.5 + prScore * 0.5;
  }

  // Discord: guild membership and linked accounts show community involvement
  if (discord) {
    components++;
    const guildScore = sigmoid(discord.guildCount, 5);
    const connectionsScore = sigmoid(discord.linkedAccountCount, 3);
    score += guildScore * 0.6 + connectionsScore * 0.4;
  }

  const normalizedScore = components > 0 ? score / components : 0;

  return normalizedScore * 0.50 * MAX_SCORE;
}

/**
 * Score recent transaction activity.
 *
 * Rewards users with recent on-chain activity, indicating active
 * community participation rather than dormant accounts.
 */
function scoreRecentActivity(onchain: OnChainActivity): number {
  // Recent transactions: half-saturation at 10
  const recentScore = sigmoid(onchain.recentTransactions, 10);

  // Total activity as context: half-saturation at 30
  const totalScore = sigmoid(onchain.totalTransactions, 30);

  // Combined: recent activity weighted higher
  const combined = recentScore * 0.7 + totalScore * 0.3;

  return combined * 0.30 * MAX_SCORE;
}

/**
 * Score cell management / on-chain presence.
 *
 * Rewards users who maintain cells on CKB, indicating active presence
 * in the ecosystem. DAO deposits are weighted higher as they show
 * deeper commitment.
 */
function scoreCellManagement(onchain: OnChainActivity): number {
  // Live cells: half-saturation at 5
  const cellScore = sigmoid(onchain.cellCount, 5);

  // DAO deposits: half-saturation at 2
  const daoScore = sigmoid(onchain.daoDeposits, 2);

  // Combined
  const combined = cellScore * 0.5 + daoScore * 0.5;

  return combined * 0.20 * MAX_SCORE;
}

/**
 * Compute the full Community Engagement score.
 *
 * @param twitter - Twitter activity data (may be undefined)
 * @param github - GitHub activity data (may be undefined)
 * @param onchain - On-chain activity data
 * @returns Community score, 0 to 100 (integer)
 */
export function computeCommunityScore(
  twitter: TwitterActivity | undefined,
  github: GitHubActivity | undefined,
  discord: DiscordActivity | undefined,
  linkedin: LinkedInActivity | undefined,
  onchain: OnChainActivity,
): number {
  const diversity = scoreInteractionDiversity(twitter, github, discord, linkedin, onchain);
  const recent = scoreRecentActivity(onchain);
  const cells = scoreCellManagement(onchain);

  const total = diversity + recent + cells;

  return Math.min(Math.max(Math.round(total), 0), MAX_SCORE);
}
