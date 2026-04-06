import { useEffect, useState } from 'react';
import type { HavenScore } from '@haven-protocol/ckb-sdk';
import { getTierForScore } from '@haven-protocol/ckb-sdk';
import TierBadge from './TierBadge';

interface ScoreCardProps {
  score: HavenScore;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export default function ScoreCard({ score, onRefresh, isRefreshing }: ScoreCardProps) {
  const tierName = getTierForScore(score.score);
  const [animatedScore, setAnimatedScore] = useState(0);

  // Animate score counting up
  useEffect(() => {
    let frame: number;
    const duration = 1500;
    const start = performance.now();
    const target = score.score;

    function animate(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedScore(Math.round(target * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    }

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score.score]);

  return (
    <div className="bg-surface-container-low p-10 rounded-xl relative overflow-hidden">
      <div className="absolute inset-0 opacity-10 pointer-events-none sovereign-gradient mix-blend-overlay" />
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <span className="text-xs font-mono text-secondary tracking-tighter uppercase">
            CRITICAL REPUTATION INDEX
          </span>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="text-on-surface-variant hover:text-primary transition-colors"
              title="Refresh score"
            >
              <span className={`material-symbols-outlined text-sm ${isRefreshing ? 'animate-spin' : ''}`}>
                refresh
              </span>
            </button>
          )}
        </div>

        <div className="flex items-end gap-6 mb-6">
          <h2 className="text-8xl font-headline font-bold tracking-tighter text-on-surface">
            {animatedScore}
          </h2>
          <div className="mb-4">
            <span className="block text-xs font-headline uppercase tracking-widest text-on-surface-variant">
              Score Tier
            </span>
            <TierBadge tier={tierName} size="lg" />
          </div>
        </div>

        <p className="max-w-md text-on-surface-variant text-sm leading-relaxed">
          Your Haven Score represents your cryptographic standing within the
          Sovereign Privacy Layer. Epoch {score.epoch}.
        </p>
      </div>
      <div className="absolute -right-12 -bottom-12 w-64 h-64 border-4 border-primary/5 rounded-full" />
    </div>
  );
}
