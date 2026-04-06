/**
 * Convert an ISO timestamp (or epoch ms) to a human-readable relative string.
 *
 * Examples: "just now", "2m ago", "1h ago", "3d ago"
 */
export function formatRelativeTime(isoDateOrMs: string | number): string {
  const then =
    typeof isoDateOrMs === 'number'
      ? isoDateOrMs
      : new Date(isoDateOrMs).getTime();

  if (Number.isNaN(then)) return 'unknown';

  const diffMs = Date.now() - then;

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  const years = Math.floor(months / 12);
  return `${years}y ago`;
}
