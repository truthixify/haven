import { useState, useEffect, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { config } from '../../config';
import { useAuth } from '../../hooks/useAuth';

interface ScoreHistoryPoint {
  epoch: number;
  score: number;
}

interface ScoreHistoryProps {
  history: ScoreHistoryPoint[];
  currentScore?: number;
  currentEpoch?: number;
}

export default function ScoreHistory({
  history: externalHistory,
  currentScore = 0,
  currentEpoch = 0,
}: ScoreHistoryProps) {
  const { identityCommitment } = useAuth();
  const [teeHistory, setTeeHistory] = useState<ScoreHistoryPoint[]>([]);

  useEffect(() => {
    if (!identityCommitment) return;
    let cancelled = false;

    fetch(`${config.teeEndpoint}/score/history?commitment=${encodeURIComponent(identityCommitment)}&limit=50`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.history) {
          setTeeHistory(data.history.map((h: { epoch: number; score: number }) => ({
            epoch: h.epoch,
            score: h.score,
          })));
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [identityCommitment, currentEpoch]);

  const chartData = useMemo(() => {
    const points: ScoreHistoryPoint[] = [{ epoch: 0, score: 0 }];

    if (teeHistory.length > 0) {
      for (const h of teeHistory) points.push(h);
    } else if (externalHistory.length >= 2) {
      return externalHistory;
    }

    if (currentScore > 0) {
      const last = points[points.length - 1];
      if (last.epoch !== currentEpoch || last.score !== currentScore) {
        points.push({ epoch: currentEpoch, score: currentScore });
      }
    }

    return points;
  }, [teeHistory, externalHistory, currentScore, currentEpoch]);

  if (chartData.length < 2) {
    return (
      <section className="bg-[#0d0e10] p-4 md:p-8 rounded-xl border-t border-[#494454]/10">
        <h3 className="text-xl font-headline font-bold text-[#e3e2e5] tracking-tight mb-2">
          Score History
        </h3>
        <div className="flex items-center justify-center py-12 text-center">
          <div>
            <span className="material-symbols-outlined text-3xl text-on-surface-variant/30 mb-2 block">timeline</span>
            <p className="text-sm text-[#cbc3d7]/60">History builds as your score updates across epochs.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-[#0d0e10] p-4 md:p-8 rounded-xl border-t border-[#494454]/10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-headline font-bold text-[#e3e2e5] tracking-tight">
            Score History
          </h3>
          <p className="text-sm text-[#cbc3d7]">
            {chartData.length} updates across {currentEpoch} epoch{currentEpoch !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <defs>
              <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#d0bcff" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#d0bcff" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#494454"
              strokeOpacity={0.2}
              vertical={false}
            />
            <XAxis
              dataKey="epoch"
              tick={{ fill: '#cbc3d7', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              tickFormatter={(v) => `E${v}`}
              axisLine={{ stroke: '#494454', strokeOpacity: 0.2 }}
              tickLine={false}
            />
            <YAxis
              domain={[0, (max: number) => Math.max(max + 50, 100)]}
              tick={{ fill: '#cbc3d7', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1b1c1e',
                border: '1px solid #494454',
                borderRadius: '8px',
                fontSize: '12px',
                fontFamily: 'JetBrains Mono',
              }}
              labelStyle={{ color: '#cbc3d7' }}
              itemStyle={{ color: '#d0bcff' }}
              formatter={(value) => [`${value}`, 'Score']}
              labelFormatter={(label) => `Epoch ${label}`}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="#d0bcff"
              strokeWidth={2}
              fill="url(#scoreGradient)"
              dot={{ fill: '#121315', stroke: '#d0bcff', strokeWidth: 2, r: 4 }}
              activeDot={{ fill: '#d0bcff', stroke: '#d0bcff', strokeWidth: 2, r: 6 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
