/**
 * useNotifications — React hook for Haven notification management.
 *
 * Provides notification fetching, unread count polling, and
 * read-marking actions via the HavenTeeClient.
 *
 * Usage:
 * ```tsx
 * import { HavenTeeClient } from '@haven-protocol/ckb-sdk/tee';
 * import { useNotifications } from '@haven-protocol/ckb-sdk/react';
 *
 * const teeClient = new HavenTeeClient('http://localhost:3000/api');
 *
 * function NotificationBell() {
 *   const { unreadCount, notifications, markAsRead, markAllAsRead, refresh } =
 *     useNotifications(teeClient, identityCommitment);
 *
 *   return <span>{unreadCount}</span>;
 * }
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { HavenTeeClient } from '../tee/client';
import type { HavenNotification } from '../tee/types';

/** Polling interval for unread count (30 seconds) */
const POLL_INTERVAL_MS = 30_000;

export interface UseNotificationsResult {
  /** Full list of notifications (fetched on demand via refresh). */
  notifications: HavenNotification[];
  /** Number of unread notifications (polled every 30s). */
  unreadCount: number;
  /** Whether notifications are currently being fetched. */
  isLoading: boolean;
  /** Mark a single notification as read by ID. */
  markAsRead: (id: string) => Promise<void>;
  /** Mark all notifications as read. */
  markAllAsRead: () => Promise<void>;
  /** Manually refresh the notification list and unread count. */
  refresh: () => Promise<void>;
}

/**
 * React hook for managing Haven notifications.
 *
 * Auto-polls the unread count every 30 seconds. Full notification
 * list is fetched on mount and on manual refresh.
 *
 * @param teeClient - A HavenTeeClient instance.
 * @param identityCommitment - The user's identity commitment, or null if not yet available.
 * @returns Notification state and action functions.
 */
export function useNotifications(
  teeClient: HavenTeeClient,
  identityCommitment: string | null,
): UseNotificationsResult {
  const [notifications, setNotifications] = useState<HavenNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Keep a ref to the latest identity so interval callbacks use current value
  const identityRef = useRef(identityCommitment);
  identityRef.current = identityCommitment;

  // Fetch full notification list
  const fetchNotifications = useCallback(async () => {
    if (!identityRef.current) return;

    setIsLoading(true);
    try {
      const list = await teeClient.getNotifications(identityRef.current, 50);
      setNotifications(list);
    } catch {
      // Keep existing list on failure
    } finally {
      setIsLoading(false);
    }
  }, [teeClient]);

  // Fetch just the unread count (lightweight poll)
  const fetchUnreadCount = useCallback(async () => {
    if (!identityRef.current) return;

    try {
      const count = await teeClient.getUnreadCount(identityRef.current);
      setUnreadCount(count);
    } catch {
      // Keep existing count on failure
    }
  }, [teeClient]);

  // Combined refresh
  const refresh = useCallback(async () => {
    await Promise.all([fetchNotifications(), fetchUnreadCount()]);
  }, [fetchNotifications, fetchUnreadCount]);

  // Mark single notification as read
  const markAsRead = useCallback(
    async (id: string) => {
      const success = await teeClient.markNotificationRead(id);
      if (success) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    },
    [teeClient],
  );

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    if (!identityRef.current) return;

    const success = await teeClient.markAllNotificationsRead(identityRef.current);
    if (success) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    }
  }, [teeClient]);

  // Initial fetch when identity becomes available
  useEffect(() => {
    if (!identityCommitment) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    refresh();
  }, [identityCommitment, refresh]);

  // Poll unread count every 30 seconds
  useEffect(() => {
    if (!identityCommitment) return;

    const interval = setInterval(fetchUnreadCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [identityCommitment, fetchUnreadCount]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    refresh,
  };
}
