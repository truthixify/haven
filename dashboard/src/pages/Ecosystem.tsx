export default function Ecosystem() {
  return (
    <>
      {/* Hero Header — matches stitch ecosystem HTML */}
      <section className="mb-16 max-w-5xl">
        <h2 className="text-3xl md:text-5xl font-['Space_Grotesk'] font-bold text-on-surface tracking-tight mb-4">
          The Sovereign{' '}
          <span className="text-primary italic">Marketplace</span>
        </h2>
        <p className="text-base md:text-lg text-on-surface-variant max-w-2xl leading-relaxed">
          Secure your identity, grow your reputation, and access exclusive
          cryptographic opportunities within the Haven Protocol ecosystem.
        </p>
      </section>

      {/* Shadow Job Board Section */}
      <section className="mb-20">
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-8 gap-4">
          <div>
            <h3 className="text-xs font-mono text-primary uppercase tracking-[0.3em] mb-2">
              Operation: Shadow Board
            </h3>
            <h4 className="text-2xl font-['Space_Grotesk'] font-bold">
              In-Protocol Opportunities
            </h4>
          </div>
          <div className="flex gap-2">
            <button className="px-4 py-2 bg-surface-container-low text-xs font-medium border border-outline-variant/10 rounded-lg hover:bg-surface-container-highest transition-colors">
              All Roles
            </button>
            <button className="px-4 py-2 bg-surface-container-low text-xs font-medium border border-outline-variant/10 rounded-lg hover:bg-surface-container-highest transition-colors">
              Engineering
            </button>
            <button className="px-4 py-2 bg-surface-container-low text-xs font-medium border border-outline-variant/10 rounded-lg hover:bg-surface-container-highest transition-colors">
              Research
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Opportunity Card 1 */}
          <div className="bg-surface-container-low p-6 rounded-xl relative overflow-hidden group border-l-2 border-primary">
            <div className="flex justify-between items-start mb-6">
              <div className="bg-surface-container-highest p-2 rounded-lg">
                <span className="material-symbols-outlined text-primary">
                  terminal
                </span>
              </div>
              <span className="text-[10px] font-mono text-secondary px-2 py-1 bg-secondary/10 rounded uppercase">
                Active
              </span>
            </div>
            <h5 className="text-xl font-bold mb-1">ZK Engineer</h5>
            <p className="text-xs text-on-surface-variant mb-6 font-mono">
              ID: 0x92f...a12 |{' '}
              <span className="italic text-primary/70">Masked Entity</span>
            </p>
            <div className="space-y-3 mb-8">
              <div className="flex justify-between text-xs">
                <span className="text-on-surface-variant">Required Tier</span>
                <span className="text-primary font-bold">Sovereign</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-on-surface-variant">Compensation</span>
                <span className="text-on-surface font-mono">
                  12,000 CKB / mo
                </span>
              </div>
            </div>
            <button className="w-full py-2.5 bg-surface-container-highest hover:bg-surface-bright text-xs font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2">
              View Specs
              <span className="material-symbols-outlined text-xs">
                arrow_forward
              </span>
            </button>
          </div>

          {/* Opportunity Card 2 */}
          <div className="bg-surface-container-low p-6 rounded-xl relative overflow-hidden group border-l-2 border-primary">
            <div className="flex justify-between items-start mb-6">
              <div className="bg-surface-container-highest p-2 rounded-lg">
                <span className="material-symbols-outlined text-primary">
                  account_tree
                </span>
              </div>
              <span className="text-[10px] font-mono text-secondary px-2 py-1 bg-secondary/10 rounded uppercase">
                High Priority
              </span>
            </div>
            <h5 className="text-xl font-bold mb-1">Protocol Architect</h5>
            <p className="text-xs text-on-surface-variant mb-6 font-mono">
              ID: 0x44c...e82 |{' '}
              <span className="italic text-primary/70">Ghost Node</span>
            </p>
            <div className="space-y-3 mb-8">
              <div className="flex justify-between text-xs">
                <span className="text-on-surface-variant">Required Tier</span>
                <span className="text-primary font-bold">Guardian</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-on-surface-variant">Compensation</span>
                <span className="text-on-surface font-mono">
                  18,500 CKB / mo
                </span>
              </div>
            </div>
            <button className="w-full py-2.5 bg-surface-container-highest hover:bg-surface-bright text-xs font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2">
              View Specs
              <span className="material-symbols-outlined text-xs">
                arrow_forward
              </span>
            </button>
          </div>

          {/* Opportunity Card 3 */}
          <div className="bg-surface-container-low p-6 rounded-xl relative overflow-hidden group border-l-2 border-primary">
            <div className="flex justify-between items-start mb-6">
              <div className="bg-surface-container-highest p-2 rounded-lg">
                <span className="material-symbols-outlined text-primary">
                  biotech
                </span>
              </div>
              <span className="text-[10px] font-mono text-tertiary px-2 py-1 bg-tertiary/10 rounded uppercase">
                Strategic
              </span>
            </div>
            <h5 className="text-xl font-bold mb-1">Reputation Analyst</h5>
            <p className="text-xs text-on-surface-variant mb-6 font-mono">
              ID: 0x11b...d99 |{' '}
              <span className="italic text-primary/70">Vault 0</span>
            </p>
            <div className="space-y-3 mb-8">
              <div className="flex justify-between text-xs">
                <span className="text-on-surface-variant">Required Tier</span>
                <span className="text-primary font-bold">Obsidian</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-on-surface-variant">Compensation</span>
                <span className="text-on-surface font-mono">
                  9,200 CKB / mo
                </span>
              </div>
            </div>
            <button className="w-full py-2.5 bg-surface-container-highest hover:bg-surface-bright text-xs font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2">
              View Specs
              <span className="material-symbols-outlined text-xs">
                arrow_forward
              </span>
            </button>
          </div>
        </div>
      </section>

      {/* Reputation Funding Pools Section */}
      <section>
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-8 gap-4">
          <div>
            <h3 className="text-xs font-mono text-secondary uppercase tracking-[0.3em] mb-2">
              Protocol Rewards
            </h3>
            <h4 className="text-2xl font-['Space_Grotesk'] font-bold">
              Reputation Funding Pools
            </h4>
          </div>
          <div className="flex items-center gap-2 text-on-surface-variant text-xs italic">
            <span className="material-symbols-outlined text-sm">info</span>
            Pools auto-distribute based on weekly cryptographic proofs.
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Funding Pool A */}
          <div className="bg-surface-container p-6 md:p-8 rounded-xl relative overflow-hidden border border-outline-variant/10 shadow-2xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-secondary/5 blur-[80px]" />
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-secondary/10 flex items-center justify-center rounded-lg">
                <span
                  className="material-symbols-outlined text-secondary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  waves
                </span>
              </div>
              <div>
                <h6 className="text-lg font-bold">Liquidity Privacy Pool</h6>
                <p className="text-xs text-on-surface-variant">
                  Incentivizing non-custodial mixing clusters
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 md:gap-8 mb-8">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">
                  Current Reward
                </p>
                <p className="text-xl md:text-2xl font-mono font-bold text-secondary text-glow-secondary">
                  425,000 <span className="text-xs">CKB</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">
                  Min Score Requirement
                </p>
                <p className="text-xl md:text-2xl font-mono font-bold text-on-surface">
                  750+
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between text-[10px] font-mono mb-1">
                <span className="text-on-surface-variant">
                  Pool Utilization
                </span>
                <span className="text-on-surface">68%</span>
              </div>
              <div className="w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
                <div className="h-full bg-secondary w-[68%]" />
              </div>
              <button className="w-full py-3 bg-secondary/10 hover:bg-secondary/20 text-secondary text-xs font-bold tracking-widest uppercase transition-all rounded-lg border border-secondary/20">
                Stake Reputation
              </button>
            </div>
          </div>

          {/* Funding Pool B */}
          <div className="bg-surface-container p-6 md:p-8 rounded-xl relative overflow-hidden border border-outline-variant/10 shadow-2xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-[80px]" />
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 bg-primary/10 flex items-center justify-center rounded-lg">
                <span
                  className="material-symbols-outlined text-primary"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  shield_with_heart
                </span>
              </div>
              <div>
                <h6 className="text-lg font-bold">DAO Governance Yield</h6>
                <p className="text-xs text-on-surface-variant">
                  For high-reputation voters and proposers
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 md:gap-8 mb-8">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">
                  Total Allocated
                </p>
                <p className="text-xl md:text-2xl font-mono font-bold text-primary">
                  1.2M <span className="text-xs">CKB</span>
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-on-surface-variant mb-1">
                  Tier Threshold
                </p>
                <p className="text-xl md:text-2xl font-mono font-bold text-on-surface italic tracking-tighter">
                  Sovereign
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between text-[10px] font-mono mb-1">
                <span className="text-on-surface-variant">
                  Active Contributors
                </span>
                <span className="text-on-surface">142</span>
              </div>
              <div className="w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
                <div className="h-full bg-primary w-[32%]" />
              </div>
              <button className="w-full py-3 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold tracking-widest uppercase transition-all rounded-lg border border-primary/20">
                Authorize Participation
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
