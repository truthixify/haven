import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { TWITTER_API_BASE } from '../../common/constants';
import { TwitterActivity } from '../../common/types';

/**
 * Twitter Activity Collector
 *
 * Fetches activity data from the Twitter API v2 using the user's
 * OAuth token (stored in sealed storage).
 *
 * All data collected here stays within the TEE and is discarded
 * after scoring. It is never logged, persisted, or transmitted
 * outside the enclave.
 */
@Injectable()
export class TwitterCollector {
  private readonly logger = new Logger(TwitterCollector.name);

  /**
   * Collect Twitter activity for a user.
   *
   * @param accessToken - User's Twitter OAuth access token (from sealed storage)
   * @param twitterId - User's Twitter ID (from sealed storage)
   * @returns Twitter activity data for scoring, or null if collection fails
   */
  async collect(
    accessToken: string,
    twitterId: string,
  ): Promise<TwitterActivity | null> {
    try {
      const client = this.createClient(accessToken);

      // Fetch user profile data
      const profile = await this.fetchUserProfile(client, twitterId);
      if (!profile) {
        return null;
      }

      // Fetch recent tweets (last 7 days)
      const recentTweets = await this.fetchRecentTweets(client, twitterId);

      // Calculate account age in days
      const createdAt = new Date(profile.created_at);
      const accountAge = Math.floor(
        (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Count privacy and ZK-related mentions
      const { privacyMentions, zkMentions } =
        this.countPrivacyContent(recentTweets);

      const activity: TwitterActivity = {
        accountAge,
        followerCount: profile.public_metrics?.followers_count ?? 0,
        followingCount: profile.public_metrics?.following_count ?? 0,
        tweetCount: profile.public_metrics?.tweet_count ?? 0,
        recentTweets: recentTweets.length,
        recentRetweets: recentTweets.filter(
          (t: any) => t.referenced_tweets?.some((r: any) => r.type === 'retweeted'),
        ).length,
        recentLikes: recentTweets.filter(
          (t: any) => t.public_metrics?.like_count > 0,
        ).length,
        recentReplies: recentTweets.filter(
          (t: any) => t.referenced_tweets?.some((r: any) => r.type === 'replied_to'),
        ).length,
        privacyMentions,
        zkMentions,
        accountVerified: profile.verified ?? false,
      };

      this.logger.debug(
        `Twitter activity collected: ${activity.recentTweets} recent tweets, account age ${activity.accountAge}d`,
      );

      return activity;
    } catch (error) {
      this.logger.error('Failed to collect Twitter activity', error);
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private createClient(accessToken: string): AxiosInstance {
    return axios.create({
      baseURL: TWITTER_API_BASE,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15_000,
    });
  }

  private async fetchUserProfile(
    client: AxiosInstance,
    twitterId: string,
  ): Promise<any> {
    try {
      const response = await client.get(`/users/${twitterId}`, {
        params: {
          'user.fields': 'created_at,public_metrics,verified',
        },
      });
      return response.data?.data ?? null;
    } catch (error) {
      this.logger.error(`Failed to fetch Twitter profile for ${twitterId}`);
      return null;
    }
  }

  private async fetchRecentTweets(
    client: AxiosInstance,
    twitterId: string,
  ): Promise<any[]> {
    try {
      const sevenDaysAgo = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const response = await client.get(`/users/${twitterId}/tweets`, {
        params: {
          max_results: 100,
          start_time: sevenDaysAgo,
          'tweet.fields': 'public_metrics,referenced_tweets,text',
        },
      });

      return response.data?.data ?? [];
    } catch (error) {
      this.logger.error(`Failed to fetch tweets for ${twitterId}`);
      return [];
    }
  }

  private countPrivacyContent(tweets: any[]): {
    privacyMentions: number;
    zkMentions: number;
  } {
    const privacyKeywords = [
      'privacy',
      'private',
      'anonymity',
      'anonymous',
      'shielded',
      'confidential',
      'encryption',
      'ckb',
      'nervos',
      'haven',
    ];

    const zkKeywords = [
      'zero knowledge',
      'zero-knowledge',
      'zk-snark',
      'zk-stark',
      'zkp',
      'groth16',
      'plonk',
      'sp1',
      'risc zero',
      'succinct',
      'proof system',
    ];

    let privacyMentions = 0;
    let zkMentions = 0;

    for (const tweet of tweets) {
      const text = (tweet.text ?? '').toLowerCase();

      if (privacyKeywords.some((kw) => text.includes(kw))) {
        privacyMentions++;
      }

      if (zkKeywords.some((kw) => text.includes(kw))) {
        zkMentions++;
      }
    }

    return { privacyMentions, zkMentions };
  }
}
