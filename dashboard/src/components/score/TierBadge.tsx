import type { TierName } from '@haven-protocol/ckb-sdk';

interface TierBadgeProps {
  tier: TierName;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

/** Tier badge visual styles using the design system tokens. */
const TIER_STYLES: Record<TierName, { color: string; bgColor: string; borderColor: string }> = {
  Observer:  { color: 'text-on-surface-variant', bgColor: 'bg-surface-container-highest', borderColor: 'border-outline-variant/30' },
  Initiate:  { color: 'text-primary',            bgColor: 'bg-primary/10',               borderColor: 'border-primary/20' },
  Trusted:   { color: 'text-secondary',          bgColor: 'bg-secondary/10',             borderColor: 'border-secondary/20' },
  Guardian:  { color: 'text-primary',            bgColor: 'bg-primary/10',               borderColor: 'border-primary/20' },
  Sovereign: { color: 'text-tertiary',           bgColor: 'bg-tertiary/10',              borderColor: 'border-tertiary/20' },
};

const SIZE_CLASSES = {
  sm: 'px-2 py-0.5 text-[10px]',
  md: 'px-3 py-1 text-xs',
  lg: 'px-3 py-1 text-sm',
};

export default function TierBadge({ tier, size = 'md', showLabel = true }: TierBadgeProps) {
  const style = TIER_STYLES[tier];
  const sizeClass = SIZE_CLASSES[size];

  return (
    <span
      className={`inline-flex items-center rounded-full font-bold ${style.bgColor} ${style.color} ${style.borderColor} border ${sizeClass} shadow-[0_0_15px_rgba(208,188,255,0.1)]`}
    >
      {showLabel && tier}
    </span>
  );
}
