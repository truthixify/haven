import { useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { HavenNotification } from '../../hooks/useNotifications';

// ---------------------------------------------------------------------------
// Type-to-icon mapping (Material Symbols Outlined ligature names)
// ---------------------------------------------------------------------------

const TYPE_ICONS: Record<string, string> = {
  score_update: 'trending_up',
  tier_change: 'military_tech',
  deposit_low: 'warning',
  epoch_complete: 'check_circle',
  system: 'info',
};

function getIcon(type: string): string {
  return TYPE_ICONS[type] ?? 'notifications';
}

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = Date.now();
  const diff = now - date.getTime();

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return date.toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NotificationPanelProps {
  notifications: HavenNotification[];
  isLoading: boolean;
  onMarkAsRead: (id: string) => Promise<void>;
  onMarkAllAsRead: () => Promise<void>;
  onClose: () => void;
  /** Bounding rect of the bell icon for positioning the dropdown */
  anchorRect: DOMRect | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NotificationPanel({
  notifications,
  isLoading,
  onMarkAsRead,
  onMarkAllAsRead,
  onClose,
  anchorRect,
}: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleClickOutside, handleKeyDown]);

  // Determine positioning based on anchor and viewport
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const hasUnread = notifications.some((n) => !n.read);

  const panel = (
    <div
      ref={panelRef}
      className={
        isMobile
          ? // Mobile: centered modal
            'fixed inset-x-4 top-20 bottom-20 z-50 flex flex-col bg-[#0d0e10] border border-[#292a2c]/15 rounded-xl shadow-2xl overflow-hidden'
          : // Desktop: positioned dropdown below the bell icon
            'fixed z-50 flex flex-col bg-[#0d0e10] border border-[#292a2c]/15 rounded-xl shadow-2xl overflow-hidden'
      }
      style={
        !isMobile && anchorRect
          ? {
              top: anchorRect.bottom + 8,
              right: Math.max(16, window.innerWidth - anchorRect.right),
              width: 380,
              maxHeight: 480,
            }
          : !isMobile
            ? { top: 72, right: 16, width: 380, maxHeight: 480 }
            : undefined
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#292a2c]/15">
        <h3 className="font-['Space_Grotesk'] text-sm font-semibold tracking-wide text-[#e3e2e5]">
          Notifications
        </h3>
        {hasUnread && (
          <button
            onClick={onMarkAllAsRead}
            className="text-[10px] font-['JetBrains_Mono'] text-[#d0bcff] hover:text-[#d0bcff]/80 transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {isLoading && notifications.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-[#cbc3d7]/40 text-xs font-['JetBrains_Mono']">
            Loading...
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <span className="material-symbols-outlined text-[#cbc3d7]/20 text-3xl">
              notifications_off
            </span>
            <span className="text-[#cbc3d7]/40 text-xs font-['JetBrains_Mono']">
              No notifications yet
            </span>
          </div>
        ) : (
          notifications.map((notification) => (
            <button
              key={notification.id}
              onClick={() => {
                if (!notification.read) {
                  onMarkAsRead(notification.id);
                }
              }}
              className={`w-full text-left px-4 py-3 flex gap-3 items-start transition-colors hover:bg-[#1a1b1d] ${
                !notification.read
                  ? 'border-l-2 border-l-[#d0bcff] bg-[#d0bcff]/[0.03]'
                  : 'border-l-2 border-l-transparent'
              }`}
            >
              {/* Icon */}
              <span
                className={`material-symbols-outlined text-lg mt-0.5 shrink-0 ${
                  notification.type === 'deposit_low'
                    ? 'text-amber-400'
                    : notification.type === 'tier_change'
                      ? 'text-[#44e2cd]'
                      : notification.type === 'score_update'
                        ? 'text-[#d0bcff]'
                        : 'text-[#cbc3d7]/60'
                }`}
              >
                {getIcon(notification.type)}
              </span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-[#e3e2e5] text-xs font-medium leading-snug truncate">
                  {notification.title}
                </p>
                <p className="text-[#cbc3d7] text-[11px] leading-relaxed mt-0.5 line-clamp-2">
                  {notification.message}
                </p>
                <span className="text-[#cbc3d7]/40 font-['JetBrains_Mono'] text-[10px] mt-1 block">
                  {timeAgo(notification.createdAt)}
                </span>
              </div>

              {/* Unread dot */}
              {!notification.read && (
                <span className="mt-1.5 shrink-0 w-2 h-2 rounded-full bg-[#d0bcff]" />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );

  // Render via portal so the dropdown isn't clipped by parent overflow
  return createPortal(panel, document.body);
}
