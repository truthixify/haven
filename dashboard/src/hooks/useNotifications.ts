import { useNotifications as useSdkNotifications } from '@haven-protocol/ckb-sdk/react';
import type { HavenNotification } from '@haven-protocol/ckb-sdk/tee';
import { useAuth } from './useAuth';

export type { HavenNotification };

/**
 * Dashboard wrapper around the SDK's useNotifications hook.
 *
 * Automatically resolves the teeClient and identityCommitment from
 * the dashboard's useAuth hook, so consuming components don't need
 * to thread those through manually.
 */
export function useNotifications() {
  const { teeClient, identityCommitment } = useAuth();

  const result = useSdkNotifications(teeClient, identityCommitment);

  return result;
}
