import { useState, useRef, useCallback } from 'react';
import { useHavenScore } from '../../hooks/useHavenScore';
import { useNotifications } from '../../hooks/useNotifications';
import NotificationPanel from '../notifications/NotificationPanel';

export default function TopBar() {
  const { score } = useHavenScore();
  const {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
    refresh,
  } = useNotifications();

  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);

  const togglePanel = useCallback(() => {
    setIsPanelOpen((prev) => {
      const opening = !prev;
      // Refresh notifications when opening the panel
      if (opening) refresh();
      return opening;
    });
  }, [refresh]);

  const closePanel = useCallback(() => {
    setIsPanelOpen(false);
  }, []);

  // Get the bounding rect of the bell button for panel positioning
  const anchorRect = bellRef.current?.getBoundingClientRect() ?? null;

  return (
    <header className="fixed top-0 right-0 w-full md:w-[calc(100%-16rem)] h-16 bg-[#121315]/70 backdrop-blur-xl border-b border-[#cbc3d7]/15 flex items-center justify-between px-4 md:px-8 z-40 transition-opacity duration-300">
      <div className="flex items-center gap-4 md:gap-6">
        {/* Mobile logo */}
        <span className="md:hidden text-lg font-bold tracking-tighter text-[#d0bcff] font-['Space_Grotesk']">
          HAVEN
        </span>
        {/* Desktop label */}
        <span className="hidden md:inline font-['Space_Grotesk'] uppercase tracking-widest text-xs text-[#cbc3d7]">
          Haven Protocol
        </span>
        <div className="hidden md:block h-4 w-px bg-outline-variant/30" />
        <div className="flex gap-4 font-['Space_Grotesk'] uppercase tracking-widest text-xs">
          <span className="text-[#d0bcff]">
            Score: {score ? score.score : '--'}
          </span>
          <span className="hidden sm:inline text-[#cbc3d7]">
            Tier: {score ? getTierLabel(score.score) : '--'}
          </span>
        </div>
      </div>
      {/* Right side — notifications */}
      <div className="flex items-center gap-4 md:gap-6">
        <button
          ref={bellRef}
          onClick={togglePanel}
          className="relative material-symbols-outlined text-[#cbc3d7] hover:brightness-125 transition-all"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
          notifications
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold font-['JetBrains_Mono'] text-[#121315] bg-[#d0bcff] rounded-full leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Notification dropdown */}
      {isPanelOpen && (
        <NotificationPanel
          notifications={notifications}
          isLoading={isLoading}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onClose={closePanel}
          anchorRect={anchorRect}
        />
      )}
    </header>
  );
}

function getTierLabel(score: number): string {
  if (score >= 850) return 'Sovereign';
  if (score >= 650) return 'Guardian';
  if (score >= 400) return 'Trusted';
  if (score >= 200) return 'Initiate';
  return 'Observer';
}
