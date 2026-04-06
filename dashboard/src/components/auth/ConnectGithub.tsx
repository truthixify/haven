import { useState } from 'react';
import { getGithubAuthUrl } from '../../hooks/useAuth';
import { config } from '../../config';

interface ConnectGithubProps {
  isConnected: boolean;
  disabled?: boolean;
}

export default function ConnectGithub({ isConnected, disabled }: ConnectGithubProps) {
  const [isLoading, setIsLoading] = useState(false);

  const isOAuthConfigured = !!config.githubClientId;

  const handleConnect = () => {
    if (isConnected || disabled || !isOAuthConfigured) return;
    setIsLoading(true);
    const callbackUrl = `${window.location.origin}/identity?auth=github`;
    window.location.href = getGithubAuthUrl(callbackUrl);
  };

  if (isConnected) {
    return (
      <div className="flex items-center justify-between p-4 rounded-lg bg-surface-container border-t-2 border-primary">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center bg-surface-container-highest">
            <span className="material-symbols-outlined text-primary">
              terminal
            </span>
          </div>
          <div>
            <p className="text-sm font-headline font-medium text-on-surface">GitHub</p>
            <p className="text-xs text-on-surface-variant">Account linked via TEE</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-secondary uppercase tracking-widest bg-secondary/10 px-2 py-1">
          <span className="w-1 h-1 rounded-full bg-secondary" />
          Connected
        </span>
      </div>
    );
  }

  if (!isOAuthConfigured) {
    return (
      <div className="flex items-center justify-between p-4 rounded-lg bg-surface-container border-t-2 border-outline-variant opacity-70">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center bg-surface-container-highest">
            <span className="material-symbols-outlined text-outline">
              terminal
            </span>
          </div>
          <div>
            <p className="text-sm font-headline font-medium text-on-surface">GitHub</p>
            <p className="text-xs text-on-surface-variant">OAuth not configured yet</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-outline uppercase tracking-widest">
          Coming Soon
        </span>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={disabled || isLoading}
      className="w-full flex items-center justify-between p-4 rounded-lg bg-surface-container border-t-2 border-outline-variant hover:bg-surface-container-high transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center bg-surface-container-highest group-hover:bg-primary/10 transition-colors">
          <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors">
            terminal
          </span>
        </div>
        <div className="text-left">
          <p className="text-sm font-headline font-medium text-on-surface">GitHub</p>
          <p className="text-xs text-on-surface-variant">Connect via OAuth to TEE</p>
        </div>
      </div>
      {isLoading ? (
        <span className="material-symbols-outlined text-on-surface-variant animate-spin text-sm">
          progress_activity
        </span>
      ) : (
        <span className="material-symbols-outlined text-outline group-hover:text-primary transition-colors text-sm">
          open_in_new
        </span>
      )}
    </button>
  );
}
