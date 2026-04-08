import type { ScoreBreakdown as BreakdownType } from '@haven-protocol-ckb/sdk';
import { MAX_COMPONENT_SCORES } from '@haven-protocol-ckb/sdk';
import { useSystemStatus } from '../../hooks/useSystemStatus';
import { formatRelativeTime } from '../../utils/formatRelativeTime';

interface ScoreBreakdownProps {
  breakdown: BreakdownType;
}

const COMPONENT_CONFIG = [
  {
    key: 'privacy' as const,
    icon: 'security',
    label: 'Privacy Hygiene',
    weight: '40%',
    color: 'bg-primary',
    iconColor: 'text-primary',
  },
  {
    key: 'contribution' as const,
    icon: 'hub',
    label: 'Ecosystem Contribution',
    weight: '30%',
    color: 'bg-secondary',
    iconColor: 'text-secondary',
  },
  {
    key: 'humanity' as const,
    icon: 'person_check',
    label: 'Proof of Human',
    weight: '20%',
    color: 'bg-tertiary',
    iconColor: 'text-tertiary',
  },
  {
    key: 'community' as const,
    icon: 'group',
    label: 'Community Engagement',
    weight: '10%',
    color: 'bg-on-surface-variant',
    iconColor: 'text-on-surface-variant',
  },
];

export default function ScoreBreakdown({ breakdown }: ScoreBreakdownProps) {
  const { lastAttestation } = useSystemStatus();

  const lastSyncLabel = lastAttestation
    ? `Last Sync: ${formatRelativeTime(lastAttestation)}`
    : 'Last Sync: --';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <h3 className="text-xl font-headline font-bold text-on-surface tracking-tight">
          Integrity Breakdown
        </h3>
        <span className="text-xs font-mono text-on-surface-variant/60 uppercase">
          {lastSyncLabel}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {COMPONENT_CONFIG.map(({ key, icon, label, weight, color, iconColor }) => {
          const value = breakdown[key];
          const max = MAX_COMPONENT_SCORES[key];
          const percentage = Math.min(100, (value / max) * 100);

          return (
            <div
              key={key}
              className="bg-surface-container p-6 rounded-lg group hover:bg-surface-container-high transition-all"
            >
              <div className="flex justify-between items-start mb-6">
                <span className={`material-symbols-outlined ${iconColor}`}>
                  {icon}
                </span>
                <span className="text-2xl font-mono font-bold text-on-surface">
                  {weight}
                </span>
              </div>
              <p className="text-sm font-headline font-medium text-on-surface mb-1">
                {label}
              </p>
              <div className="h-1 w-full bg-surface-container-highest rounded-full overflow-hidden">
                <div
                  className={`h-full ${color} transition-all duration-1000`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
