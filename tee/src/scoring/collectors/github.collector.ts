import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { GITHUB_API_BASE, PRIVACY_REPO_KEYWORDS } from '../../common/constants';
import { GitHubActivity } from '../../common/types';

/**
 * GitHub Activity Collector
 *
 * Fetches activity data from the GitHub API using the user's
 * OAuth token (stored in sealed storage).
 *
 * All data collected here stays within the TEE and is discarded
 * after scoring.
 */
@Injectable()
export class GitHubCollector {
  private readonly logger = new Logger(GitHubCollector.name);

  /**
   * Collect GitHub activity for a user.
   *
   * @param accessToken - User's GitHub OAuth access token (from sealed storage)
   * @returns GitHub activity data for scoring, or null if collection fails
   */
  async collect(accessToken: string): Promise<GitHubActivity | null> {
    try {
      const client = this.createClient(accessToken);

      // Fetch authenticated user profile
      const profile = await this.fetchUserProfile(client);
      if (!profile) {
        return null;
      }

      // Fetch repos to analyze contributions
      const repos = await this.fetchUserRepos(client);

      // Fetch recent events (commits, PRs, issues)
      const events = await this.fetchRecentEvents(client, profile.login);

      // Analyze privacy/ZK repo contributions
      const { privacyRepoCommits, zkRepoCommits, hasNodeRepo } =
        this.analyzeRepos(repos);

      // Count recent commits (last 30 days)
      const recentCommits = events.filter(
        (e: any) =>
          e.type === 'PushEvent' &&
          new Date(e.created_at).getTime() >
            Date.now() - 30 * 24 * 60 * 60 * 1000,
      ).length;

      // Count PRs and issues
      const pullRequestCount = events.filter(
        (e: any) => e.type === 'PullRequestEvent',
      ).length;

      const issueCount = events.filter(
        (e: any) => e.type === 'IssuesEvent',
      ).length;

      // Calculate account age in days
      const createdAt = new Date(profile.created_at);
      const accountAge = Math.floor(
        (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Count unique organizations contributed to
      const contributedToOrgs = new Set(
        repos
          .filter((r: any) => r.fork === false && r.owner?.type === 'Organization')
          .map((r: any) => r.owner?.login),
      ).size;

      // Estimate total commits last year using contribution stats
      const totalCommitsLastYear = await this.estimateYearlyCommits(
        client,
        profile.login,
      );

      const activity: GitHubActivity = {
        accountAge,
        publicRepos: profile.public_repos ?? 0,
        totalCommitsLastYear,
        privacyRepoCommits,
        zkRepoCommits,
        pullRequestCount,
        issueCount,
        contributedToOrgs,
        recentCommits,
        hasNodeRepo,
      };

      this.logger.debug(
        `GitHub activity collected: ${activity.publicRepos} repos, ${activity.recentCommits} recent commits`,
      );

      return activity;
    } catch (error) {
      this.logger.error('Failed to collect GitHub activity', error);
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private createClient(accessToken: string): AxiosInstance {
    return axios.create({
      baseURL: GITHUB_API_BASE,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
      timeout: 15_000,
    });
  }

  private async fetchUserProfile(client: AxiosInstance): Promise<any> {
    try {
      const response = await client.get('/user');
      return response.data;
    } catch (error) {
      this.logger.error('Failed to fetch GitHub profile');
      return null;
    }
  }

  private async fetchUserRepos(client: AxiosInstance): Promise<any[]> {
    try {
      const response = await client.get('/user/repos', {
        params: {
          per_page: 100,
          sort: 'updated',
          type: 'all',
        },
      });
      return response.data ?? [];
    } catch (error) {
      this.logger.error('Failed to fetch GitHub repos');
      return [];
    }
  }

  private async fetchRecentEvents(
    client: AxiosInstance,
    username: string,
  ): Promise<any[]> {
    try {
      const response = await client.get(`/users/${username}/events`, {
        params: { per_page: 100 },
      });
      return response.data ?? [];
    } catch (error) {
      this.logger.error('Failed to fetch GitHub events');
      return [];
    }
  }

  /**
   * Estimate total commits in the last year using the events API.
   * GitHub's contribution graph data is not available via REST API,
   * so we approximate from push events and repo statistics.
   */
  private async estimateYearlyCommits(
    client: AxiosInstance,
    username: string,
  ): Promise<number> {
    try {
      // Use the search API to count commits by the user in the last year
      const oneYearAgo = new Date(
        Date.now() - 365 * 24 * 60 * 60 * 1000,
      ).toISOString().split('T')[0];

      const response = await client.get('/search/commits', {
        params: {
          q: `author:${username} committer-date:>${oneYearAgo}`,
          per_page: 1,
        },
        headers: {
          Accept: 'application/vnd.github.cloak-preview+json',
        },
      });

      return response.data?.total_count ?? 0;
    } catch {
      // Search API might rate-limit; fall back to a rough estimate
      return 0;
    }
  }

  /**
   * Analyze repositories for privacy/ZK relevance.
   */
  private analyzeRepos(repos: any[]): {
    privacyRepoCommits: number;
    zkRepoCommits: number;
    hasNodeRepo: boolean;
  } {
    let privacyRepoCommits = 0;
    let zkRepoCommits = 0;
    let hasNodeRepo = false;

    for (const repo of repos) {
      const name = (repo.name ?? '').toLowerCase();
      const description = (repo.description ?? '').toLowerCase();
      const topics: string[] = repo.topics ?? [];
      const combined = `${name} ${description} ${topics.join(' ')}`;

      const isPrivacyRepo = PRIVACY_REPO_KEYWORDS.some((kw) =>
        combined.includes(kw),
      );

      const isZkRepo = [
        'zero-knowledge',
        'zk-snark',
        'zk-stark',
        'zkp',
        'groth16',
        'plonk',
        'halo2',
        'sp1',
        'risc0',
        'noir',
        'circom',
      ].some((kw) => combined.includes(kw));

      // Check if this looks like a blockchain node repository
      const isNodeRepo = [
        'node',
        'validator',
        'miner',
        'full-node',
        'ckb-node',
      ].some((kw) => combined.includes(kw));

      if (isPrivacyRepo && !repo.fork) {
        // Weight by repo size as a proxy for contribution depth
        privacyRepoCommits += Math.min(repo.size ?? 0, 1000);
      }

      if (isZkRepo && !repo.fork) {
        zkRepoCommits += Math.min(repo.size ?? 0, 1000);
      }

      if (isNodeRepo) {
        hasNodeRepo = true;
      }
    }

    return { privacyRepoCommits, zkRepoCommits, hasNodeRepo };
  }
}
