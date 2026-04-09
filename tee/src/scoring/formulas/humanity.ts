import {
  DiscordActivity,
  LinkedInActivity,
  TwitterActivity,
  GitHubActivity,
  OnChainActivity,
} from '../../common/types';
import { COMPONENT_MAX } from '../../common/constants';

/**
 * Proof of Human Formula (20% weight, max 200 points)
 *
 * Measures sybil resistance signals - how likely this is a real human
 * rather than a bot or sockpuppet.
 *
 * Reweighted to produce non-zero scores from CKB-only activity (no social):
 * - Account age (50% of component)
 * - Cross-platform consistency / wallet base score (30% of component)
 * - Transaction regularity (20% of component)
 *
 * When social platforms ARE linked, those signals blend in and boost the score.
 */

const MAX_SCORE = COMPONENT_MAX.PROOF_OF_HUMAN; // 200

const WEIGHTS = {
  ACCOUNT_AGE: 0.50,
  CROSS_PLATFORM: 0.30,
  TRANSACTION_REGULARITY: 0.20,
} as const;

function sigmoid(value: number, halfSaturation: number): number {
  if (value <= 0) return 0;
  return value / (value + halfSaturation);
}

/**
 * Score account age across platforms.
 *
 * Older accounts are harder for sybils to produce at scale.
 * Uses the maximum age across all platforms (most conservative approach).
 *
 * Half-saturation at 365 days (1 year). An account that's 1 year old
 * gets 50% of this component. Accounts >3 years old approach maximum.
 *
 * On-chain account age alone is sufficient to produce a score.
 */
function scoreAccountAge(
  twitter: TwitterActivity | undefined,
  github: GitHubActivity | undefined,
  discord: DiscordActivity | undefined,
  _linkedin: LinkedInActivity | undefined,
  onchain: OnChainActivity,
): number {
  const ages: number[] = [];

  if (twitter) ages.push(twitter.accountAge);
  if (github) ages.push(github.accountAge);
  if (discord) ages.push(discord.accountAge);
  if (onchain.accountAgeDays > 0) ages.push(onchain.accountAgeDays);

  if (ages.length === 0) return 0;

  // Use average age across connected platforms
  const averageAge = ages.reduce((a, b) => a + b, 0) / ages.length;

  // Bonus for having multiple old accounts (harder to fake)
  const multiPlatformBonus = ages.length >= 2 ? 1.2 : 1.0;

  const normalizedAge = sigmoid(averageAge, 365) * multiPlatformBonus;

  return Math.min(normalizedAge, 1.0) * WEIGHTS.ACCOUNT_AGE * MAX_SCORE;
}

/**
 * Score cross-platform consistency.
 *
 * Checks whether the user has consistent activity patterns across platforms.
 * Sybils often have activity on one platform but are dormant on others.
 *
 * Having a wallet connected always provides a base score (30% of this component).
 * Additional platforms boost it further.
 */
function scoreCrossPlatformConsistency(
  twitter: TwitterActivity | undefined,
  github: GitHubActivity | undefined,
  discord: DiscordActivity | undefined,
  linkedin: LinkedInActivity | undefined,
  onchain: OnChainActivity,
): number {
  let platformsConnected = 1; // Wallet is always connected
  let platformsActive = 0;
  const totalPlatforms = 5; // wallet, twitter, github, discord, linkedin

  if (onchain.totalTransactions > 0) platformsActive++;

  if (twitter) {
    platformsConnected++;
    if (twitter.recentTweets > 0) platformsActive++;
  }

  if (github) {
    platformsConnected++;
    if (github.recentCommits > 0) platformsActive++;
  }

  if (discord) {
    platformsConnected++;
    if (discord.guildCount > 0) platformsActive++;
  }

  if (linkedin) {
    platformsConnected++;
    if (linkedin.hasProfile) platformsActive++;
  }

  const connectionScore = platformsConnected / totalPlatforms;

  // Activity score: being active on connected platforms
  const activityScore =
    platformsConnected > 0
      ? platformsActive / platformsConnected
      : 0;

  // When only wallet is connected and active: connectionScore=0.33, activityScore=1.0
  // Combined = 0.33*0.4 + 1.0*0.6 = 0.73 — gives a decent base
  const combined = connectionScore * 0.4 + activityScore * 0.6;

  return combined * WEIGHTS.CROSS_PLATFORM * MAX_SCORE;
}

/**
 * Score transaction regularity.
 *
 * Rewards organic transaction patterns rather than bot-like bursts.
 * Considers the ratio of recent-to-total transactions and overall
 * transaction diversity as signals of regular human usage.
 */
function scoreTransactionRegularity(onchain: OnChainActivity): number {
  if (onchain.totalTransactions === 0) return 0;

  // Activity consistency: ratio of recent (30-day) to total transactions
  // A ratio of ~0.1–0.5 suggests ongoing regular usage
  const consistencyRatio = Math.min(
    onchain.recentTransactions / onchain.totalTransactions,
    1,
  );

  // Optimal consistency: sigmoid centered around healthy ratios
  const consistencyScore =
    consistencyRatio > 0 ? sigmoid(consistencyRatio * 10, 3) : 0;

  // Transaction diversity: unique addresses interacted with
  const diversityScore = sigmoid(onchain.uniqueAddressesUsed, 10);

  // Overall transaction volume as a base signal
  const volumeScore = sigmoid(onchain.totalTransactions, 20);

  // Composite score
  const composite =
    consistencyScore * 0.3 + diversityScore * 0.3 + volumeScore * 0.4;

  return composite * WEIGHTS.TRANSACTION_REGULARITY * MAX_SCORE;
}

/**
 * Compute the full Proof of Human score.
 *
 * @param twitter - Twitter activity data (may be undefined)
 * @param github - GitHub activity data (may be undefined)
 * @param onchain - On-chain activity data
 * @returns Humanity score, 0 to 200 (integer)
 */
export function computeHumanityScore(
  twitter: TwitterActivity | undefined,
  github: GitHubActivity | undefined,
  discord: DiscordActivity | undefined,
  linkedin: LinkedInActivity | undefined,
  onchain: OnChainActivity,
): number {
  const age = scoreAccountAge(twitter, github, discord, linkedin, onchain);
  const crossPlatform = scoreCrossPlatformConsistency(
    twitter,
    github,
    discord,
    linkedin,
    onchain,
  );
  const regularity = scoreTransactionRegularity(onchain);

  const total = age + crossPlatform + regularity;

  return Math.min(Math.max(Math.round(total), 0), MAX_SCORE);
}
