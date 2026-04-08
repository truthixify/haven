/**
 * HavenTeeClient — HTTP client for the Haven TEE (Trusted Execution
 * Environment) service.
 *
 * Handles OAuth flows, identity registration, connection status checks,
 * and score refresh requests. All communication is via fetch — no
 * additional HTTP dependencies required.
 *
 * Usage:
 * ```ts
 * import { HavenTeeClient } from '@haven-protocol/ckb-sdk/tee';
 *
 * const tee = new HavenTeeClient('http://localhost:3000/api');
 *
 * // Register identity
 * const { identityCommitment } = await tee.registerIdentity(
 *   address, pubKey, signature, message,
 * );
 *
 * // Check connections
 * const status = await tee.getConnectionStatus(identityCommitment);
 * ```
 */

import type { ConnectionStatus, HavenNotification, ScoreHistoryEntry, TeeClientOptions, TeeHealthStatus } from './types';

// Default timeout for all requests (30 seconds)
const DEFAULT_TIMEOUT = 30_000;

export class HavenTeeClient {
  private readonly endpoint: string;
  private readonly timeout: number;

  /**
   * Create a new HavenTeeClient.
   *
   * @param endpointOrOptions - Either a TEE endpoint URL string, or a
   *                            TeeClientOptions object.
   */
  constructor(endpointOrOptions: string | TeeClientOptions) {
    if (typeof endpointOrOptions === 'string') {
      this.endpoint = endpointOrOptions.replace(/\/+$/, '');
      this.timeout = DEFAULT_TIMEOUT;
    } else {
      this.endpoint = endpointOrOptions.endpoint.replace(/\/+$/, '');
      this.timeout = endpointOrOptions.timeout ?? DEFAULT_TIMEOUT;
    }
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /**
   * Make a fetch request with timeout and standard error handling.
   */
  private async request<T>(
    path: string,
    options?: RequestInit,
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.endpoint}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `TEE request failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`,
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // -----------------------------------------------------------------------
  // Health
  // -----------------------------------------------------------------------

  /**
   * Fetch the TEE health status.
   *
   * @returns TeeHealthStatus with enclave ID, uptime, last attestation, etc.
   */
  async getHealth(): Promise<TeeHealthStatus> {
    return this.request<TeeHealthStatus>('/health');
  }

  // -----------------------------------------------------------------------
  // OAuth flows
  // -----------------------------------------------------------------------

  /**
   * Build the Twitter OAuth authorization URL.
   * The user should be redirected to this URL to begin the Twitter flow.
   *
   * @param callbackUrl - URL where Twitter should redirect after authorization.
   * @returns Full authorization URL string.
   */
  getTwitterAuthUrl(callbackUrl: string): string {
    return `${this.endpoint}/auth/twitter?callback=${encodeURIComponent(callbackUrl)}`;
  }

  /**
   * Complete the Twitter OAuth flow by sending the auth code and state
   * back to the TEE.
   *
   * @param identityCommitment - The user's identity commitment (hex).
   * @param code  - OAuth authorization code from Twitter callback.
   * @param state - OAuth state parameter from Twitter callback.
   * @returns `true` if the account was linked successfully.
   */
  async completeTwitterAuth(
    identityCommitment: string,
    code: string,
    state: string,
  ): Promise<boolean> {
    try {
      await this.request('/auth/twitter/callback', {
        method: 'POST',
        body: JSON.stringify({ identityCommitment, code, state }),
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build the GitHub OAuth authorization URL.
   * The user should be redirected to this URL to begin the GitHub flow.
   *
   * @param callbackUrl - URL where GitHub should redirect after authorization.
   * @returns Full authorization URL string.
   */
  getGithubAuthUrl(callbackUrl: string): string {
    return `${this.endpoint}/auth/github?callback=${encodeURIComponent(callbackUrl)}`;
  }

  /**
   * Complete the GitHub OAuth flow by sending the auth code and state
   * back to the TEE.
   *
   * @param identityCommitment - The user's identity commitment (hex).
   * @param code  - OAuth authorization code from GitHub callback.
   * @param state - OAuth state parameter from GitHub callback.
   * @returns `true` if the account was linked successfully.
   */
  async completeGithubAuth(
    identityCommitment: string,
    code: string,
    state: string,
  ): Promise<boolean> {
    try {
      await this.request('/auth/github/callback', {
        method: 'POST',
        body: JSON.stringify({ identityCommitment, code, state }),
      });
      return true;
    } catch {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Identity
  // -----------------------------------------------------------------------

  /**
   * Register a CKB wallet identity with the TEE.
   *
   * The dashboard signs an identity message via CCC, then sends the
   * public key, signature, and message to the TEE for verification.
   * On success the TEE returns the Blake2b identity commitment.
   *
   * @param ckbAddress - The user's CKB address.
   * @param pubKey     - Hex-encoded CKB public key.
   * @param signature  - Hex-encoded signature of the identity message.
   * @param message    - The identity message that was signed.
   * @returns Object with the identityCommitment string.
   * @throws If verification fails or the TEE is unreachable.
   */
  async registerIdentity(
    ckbAddress: string,
    pubKey: string,
    signature: string,
    message: string,
    lockScript?: { lockCodeHash: string; lockHashType: string; lockArgs: string },
  ): Promise<{ identityCommitment: string }> {
    return this.request<{ identityCommitment: string }>('/identity/verify', {
      method: 'POST',
      body: JSON.stringify({
        ckbPubKey: pubKey,
        address: ckbAddress,
        signature,
        message,
        ...(lockScript || {}),
      }),
    });
  }

  /**
   * Compute the identity commitment for a public key WITHOUT registering.
   * Pure computation on the TEE side — no sealed storage write.
   *
   * @param ckbPubKey - Hex-encoded CKB public key or signer identity.
   * @returns The deterministic Blake2b identity commitment.
   */
  async getCommitment(
    ckbPubKey: string,
  ): Promise<{ identityCommitment: string }> {
    return this.request<{ identityCommitment: string }>('/identity/commitment', {
      method: 'POST',
      body: JSON.stringify({ ckbPubKey }),
    });
  }

  /**
   * Check if an identity commitment is already registered in the TEE.
   *
   * @param identityCommitment - Hex-encoded commitment to check.
   * @returns Whether the identity is registered.
   */
  async checkIdentity(
    identityCommitment: string,
  ): Promise<{ registered: boolean }> {
    return this.request<{ registered: boolean }>(
      `/identity/check?commitment=${encodeURIComponent(identityCommitment)}`,
    );
  }

  /**
   * Save the score cell outpoint after creating it on-chain.
   * The TEE needs this to locate the cell for score updates.
   */
  async saveScoreCellOutpoint(
    identityCommitment: string,
    txHash: string,
    index = 0,
  ): Promise<void> {
    await this.request('/identity/score-cell', {
      method: 'POST',
      body: JSON.stringify({ identityCommitment, txHash, index }),
    });
  }

  // -----------------------------------------------------------------------
  // Connection status
  // -----------------------------------------------------------------------

  /**
   * Check which accounts are linked for a given identity commitment.
   *
   * @param identityCommitment - Hex-encoded identity commitment.
   * @returns ConnectionStatus indicating which services are linked.
   */
  async getConnectionStatus(identityCommitment: string): Promise<ConnectionStatus> {
    try {
      const status = await this.request<{
        wallet: boolean;
        twitter: boolean;
        github: boolean;
      }>(`/auth/status?commitment=${encodeURIComponent(identityCommitment)}`);

      return {
        ...status,
        identityCommitment,
      };
    } catch {
      return {
        wallet: false,
        twitter: false,
        github: false,
        identityCommitment: null,
      };
    }
  }

  // -----------------------------------------------------------------------
  // Score refresh
  // -----------------------------------------------------------------------

  /**
   * Request a manual score refresh for the given identity.
   *
   * Triggers the TEE to re-collect activity data, re-compute the score,
   * and submit an on-chain update for this user.
   *
   * @param identityCommitment - Hex-encoded identity commitment.
   * @returns `true` if the refresh request was accepted.
   */
  async requestScoreRefresh(identityCommitment: string): Promise<boolean> {
    try {
      await this.request('/score/refresh', {
        method: 'POST',
        body: JSON.stringify({ identityCommitment }),
      });
      return true;
    } catch {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Notifications
  // -----------------------------------------------------------------------

  /**
   * Fetch notifications for a given identity commitment.
   *
   * @param identityCommitment - Hex-encoded identity commitment.
   * @param limit - Maximum number of notifications to return (default 20).
   * @param unreadOnly - If true, only return unread notifications.
   * @returns Array of notifications, newest first.
   */
  async getNotifications(
    identityCommitment: string,
    limit = 20,
    unreadOnly = false,
  ): Promise<HavenNotification[]> {
    const params = new URLSearchParams({
      commitment: identityCommitment,
      limit: String(limit),
    });
    if (unreadOnly) {
      params.set('unreadOnly', 'true');
    }

    const result = await this.request<{ notifications: HavenNotification[] }>(
      `/notifications?${params.toString()}`,
    );
    return result.notifications;
  }

  /**
   * Get the count of unread notifications for a user.
   *
   * @param identityCommitment - Hex-encoded identity commitment.
   * @returns The number of unread notifications.
   */
  async getUnreadCount(identityCommitment: string): Promise<number> {
    const result = await this.request<{ count: number }>(
      `/notifications/unread-count?commitment=${encodeURIComponent(identityCommitment)}`,
    );
    return result.count;
  }

  /**
   * Mark a single notification as read.
   *
   * @param id - The notification UUID.
   * @returns `true` if the notification was marked as read.
   */
  async markNotificationRead(id: string): Promise<boolean> {
    try {
      await this.request(`/notifications/${encodeURIComponent(id)}/read`, {
        method: 'POST',
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Mark all notifications as read for a given identity commitment.
   *
   * @param identityCommitment - Hex-encoded identity commitment.
   * @returns `true` if the operation succeeded.
   */
  async markAllNotificationsRead(identityCommitment: string): Promise<boolean> {
    try {
      await this.request(
        `/notifications/read-all?commitment=${encodeURIComponent(identityCommitment)}`,
        { method: 'POST' },
      );
      return true;
    } catch {
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Score history
  // -----------------------------------------------------------------------

  /**
   * Fetch the score history for a given identity commitment.
   *
   * Returns an array of historical score entries ordered by epoch descending,
   * including the per-component breakdown and the on-chain transaction hash.
   *
   * @param identityCommitment - Hex-encoded identity commitment.
   * @param limit - Maximum number of history entries to return (default 50).
   * @returns Array of ScoreHistoryEntry objects.
   */
  async getScoreHistory(
    identityCommitment: string,
    limit = 50,
  ): Promise<ScoreHistoryEntry[]> {
    const params = new URLSearchParams({
      commitment: identityCommitment,
      limit: String(limit),
    });
    const result = await this.request<{ history: ScoreHistoryEntry[] }>(
      `/score/history?${params.toString()}`,
    );
    return result.history;
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  /**
   * Get the configured TEE endpoint URL.
   */
  getEndpoint(): string {
    return this.endpoint;
  }
}
