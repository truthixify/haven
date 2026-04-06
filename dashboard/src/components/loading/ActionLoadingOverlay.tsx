import ReactDOM from 'react-dom';

interface ProcessingStep {
  label: string;
  status: 'verified' | 'processing' | 'pending';
}

interface ActionLoadingOverlayProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  steps?: ProcessingStep[];
}

const defaultSteps: ProcessingStep[] = [
  { label: 'Phala TEE Attesting', status: 'verified' },
  { label: 'SP1 Proof Generating', status: 'processing' },
];

export default function ActionLoadingOverlay({
  isOpen,
  title = 'Securing Protocol Action',
  description = 'Generating cryptographic proofs for the requested state transition.',
  steps = defaultSteps,
}: ActionLoadingOverlayProps) {
  if (!isOpen) return null;

  const overlay = (
    <div className="fixed inset-0 z-[100] bg-[#121315]/80 backdrop-blur-md flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-[#292a2c] rounded-xl p-10 shadow-[0_0_60px_rgba(208,188,255,0.1)] border border-[#494454]/20 relative overflow-hidden">
        {/* Top accent bar */}
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#d0bcff] to-[#44e2cd]" />

        <div className="flex flex-col items-center text-center">
          {/* Spinner */}
          <div className="relative mb-8">
            <div className="loading-spinner" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="material-symbols-outlined text-[#d0bcff] text-xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                security
              </span>
            </div>
          </div>

          <h2 className="font-['Space_Grotesk'] text-2xl font-bold text-[#e3e2e5] mb-2 tracking-tight">
            {title}
          </h2>
          <p className="text-[#cbc3d7] text-sm mb-10 leading-relaxed max-w-[280px]">
            {description}
          </p>

          {/* Processing States */}
          <div className="w-full space-y-4 mb-10 text-left">
            {steps.map((step, i) => (
              <div
                key={i}
                className={`flex items-center justify-between p-3 bg-[#0d0e10] rounded-lg border-l-2 ${
                  step.status === 'verified'
                    ? 'border-[#44e2cd]'
                    : step.status === 'processing'
                      ? 'border-[#d0bcff]/40'
                      : 'border-[#494454]/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  {step.status === 'verified' ? (
                    <span className="material-symbols-outlined text-[#44e2cd] text-sm">
                      check_circle
                    </span>
                  ) : step.status === 'processing' ? (
                    <div className="w-2 h-2 rounded-full bg-[#d0bcff] animate-pulse" />
                  ) : (
                    <div className="w-2 h-2 rounded-full bg-[#494454]" />
                  )}
                  <span className="font-['JetBrains_Mono'] text-xs text-[#e3e2e5] tracking-wider">
                    {step.label}
                  </span>
                </div>
                <span
                  className={`font-['JetBrains_Mono'] text-[10px] uppercase font-bold ${
                    step.status === 'verified'
                      ? 'text-[#3cddc7]'
                      : step.status === 'processing'
                        ? 'text-[#d0bcff] animate-pulse'
                        : 'text-[#494454]'
                  }`}
                >
                  {step.status === 'verified'
                    ? 'Verified'
                    : step.status === 'processing'
                      ? 'Processing'
                      : 'Pending'}
                </span>
              </div>
            ))}
          </div>

          {/* Footer Badges */}
          <div className="flex items-center gap-4 w-full pt-6 border-t border-[#494454]/10">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-[#343537] rounded text-[10px] font-['JetBrains_Mono'] text-[#44e2cd] tracking-tighter">
              <span className="w-1 h-1 rounded-full bg-[#44e2cd]" />
              TEE_SESSION: ACTIVE
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-[#343537] rounded text-[10px] font-['JetBrains_Mono'] text-[#cbc3d7] tracking-tighter">
              NODE_LATENCY: 12MS
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(overlay, document.body);
}
