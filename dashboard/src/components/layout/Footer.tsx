import { useSystemStatus } from '../../hooks/useSystemStatus';

export default function Footer() {
  const { teeHealth, ckbBlockNumber, isOnline } = useSystemStatus();

  // Derive overall system status from TEE health + CKB connectivity
  const systemStatus = (() => {
    if (!isOnline) return 'Offline';
    if (teeHealth === 'degraded' || ckbBlockNumber === null) return 'Degraded';
    return 'Optimal';
  })();

  const statusColor =
    systemStatus === 'Optimal'
      ? '#44e2cd'
      : systemStatus === 'Degraded'
        ? '#ffb869'
        : '#ef4444';

  const teeLabel = teeHealth
    ? `TEE Health: ${teeHealth.charAt(0).toUpperCase()}${teeHealth.slice(1)}`
    : 'TEE Health: --';

  const blockLabel =
    ckbBlockNumber !== null
      ? `CKB Block: ${ckbBlockNumber.toLocaleString()}`
      : 'CKB Block: --';

  return (
    <footer className="hidden md:flex fixed bottom-0 right-0 w-[calc(100%-16rem)] py-2 bg-[#0d0e10] justify-between items-center px-8 z-40">
      <span className="font-['JetBrains_Mono'] text-[10px] text-[#cbc3d7]/60">
        Sovereign Privacy Layer
      </span>
      <div className="flex gap-6 font-['JetBrains_Mono'] text-[10px]">
        <span className="text-[#cbc3d7]/60 hover:text-[#44e2cd] transition-colors cursor-default">
          {teeLabel}
        </span>
        <span className="text-[#cbc3d7]/60 hover:text-[#44e2cd] transition-colors cursor-default">
          {blockLabel}
        </span>
        <span
          className="flex items-center gap-1"
          style={{ color: statusColor }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
          System Status: {systemStatus}
        </span>
      </div>
    </footer>
  );
}
