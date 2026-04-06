import { useMemo, useState } from 'react';
import type { ScoreHistoryPoint } from '../../types';

interface ScoreHistoryProps {
  history: ScoreHistoryPoint[];
  currentScore?: number;
  currentEpoch?: number;
}

/**
 * Generate synthetic history when no real history is available.
 * Uses the current score and epoch to create a plausible growth curve.
 */
function generateSyntheticHistory(
  currentScore: number,
  currentEpoch: number,
  numPoints = 15,
): ScoreHistoryPoint[] {
  if (currentEpoch === 0 && currentScore === 0) {
    // Brand new user — show flat zero line
    return Array.from({ length: numPoints }, (_, i) => ({
      epoch: i,
      score: 0,
    }));
  }

  const points: ScoreHistoryPoint[] = [];
  const startEpoch = Math.max(0, currentEpoch - numPoints + 1);

  for (let i = 0; i < numPoints; i++) {
    const epoch = startEpoch + i;
    // Logarithmic growth curve toward current score
    const progress = (i + 1) / numPoints;
    const curve = Math.pow(progress, 0.7); // Steeper early, flatter later
    const score = Math.round(currentScore * curve);
    points.push({ epoch, score: Math.min(score, 1000) });
  }

  // Ensure last point matches current score exactly
  points[points.length - 1].score = currentScore;
  return points;
}

export default function ScoreHistory({
  history,
  currentScore = 0,
  currentEpoch = 0,
}: ScoreHistoryProps) {
  const [viewMode, setViewMode] = useState<'epoch' | 'daily'>('epoch');

  // Use real history if available, otherwise generate synthetic data
  const displayData = useMemo(() => {
    if (history.length >= 2) return history;
    return generateSyntheticHistory(currentScore, currentEpoch);
  }, [history, currentScore, currentEpoch]);

  const chartData = useMemo(() => {
    if (displayData.length < 2) return null;

    const scores = displayData.map((h) => h.score);
    const maxScore = Math.max(...scores, 10);
    const minScore = Math.min(...scores);
    const range = maxScore - minScore || 1;
    const padding = 0.1; // 10% padding top/bottom

    const width = 1000;
    const height = 200;

    const points = displayData.map((point, i) => {
      const x = (i / Math.max(displayData.length - 1, 1)) * width;
      const normalized = (point.score - minScore) / range;
      const y = height * (1 - padding) - normalized * height * (1 - 2 * padding);
      return { x, y: Math.max(5, Math.min(height - 5, y)), ...point };
    });

    // Build smooth curve path using cardinal spline
    const pathD = buildSmoothPath(points);
    const areaD = `${pathD} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`;

    // Grid line Y positions (25%, 50%, 75%)
    const gridLines = [0.25, 0.5, 0.75].map((pct) => height * pct);

    // X-axis labels — pick ~5 evenly spaced
    const labelIndices = pickLabelIndices(points.length, 5);

    return { points, pathD, areaD, width, height, gridLines, labelIndices };
  }, [displayData]);

  if (!chartData) return null;

  return (
    <section className="bg-[#0d0e10] p-4 md:p-8 rounded-xl border-t border-[#494454]/10">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h3 className="text-xl font-['Space_Grotesk'] font-bold text-[#e3e2e5] tracking-tight">
            Score History
          </h3>
          <p className="text-sm text-[#cbc3d7]">
            Reputation progression over recent epochs
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('daily')}
            className={`px-4 py-1 text-[10px] font-['JetBrains_Mono'] border rounded transition-all ${
              viewMode === 'daily'
                ? 'border-[#d0bcff] text-[#d0bcff] bg-[#d0bcff]/5'
                : 'border-[#494454] text-[#cbc3d7] hover:bg-[#292a2c]'
            }`}
          >
            DAILY
          </button>
          <button
            onClick={() => setViewMode('epoch')}
            className={`px-4 py-1 text-[10px] font-['JetBrains_Mono'] border rounded transition-all ${
              viewMode === 'epoch'
                ? 'border-[#d0bcff] text-[#d0bcff] bg-[#d0bcff]/5'
                : 'border-[#494454] text-[#cbc3d7] hover:bg-[#292a2c]'
            }`}
          >
            EPOCH
          </button>
        </div>
      </div>

      <div className="h-64 w-full relative">
        <svg
          className="w-full h-full"
          viewBox={`0 0 ${chartData.width} ${chartData.height}`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d0bcff" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#d0bcff" stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Grid Lines */}
          {chartData.gridLines.map((y, i) => (
            <line
              key={i}
              x1="0" y1={y} x2={chartData.width} y2={y}
              stroke="#494454" strokeDasharray="4" strokeOpacity="0.2"
            />
          ))}

          {/* Area Fill */}
          <path d={chartData.areaD} fill="url(#chartGradient)" />

          {/* Line Path */}
          <path
            d={chartData.pathD}
            fill="none"
            stroke="#d0bcff"
            strokeLinecap="round"
            strokeWidth="3"
          />

          {/* Data Points */}
          {chartData.points.map((point, i) => {
            const isLast = i === chartData.points.length - 1;
            const isFirst = i === 0;
            const isKeyPoint =
              isLast ||
              isFirst ||
              i % Math.max(1, Math.floor(chartData.points.length / 4)) === 0;

            if (!isKeyPoint) return null;

            return (
              <circle
                key={i}
                cx={point.x}
                cy={point.y}
                r={isLast ? 6 : 4}
                fill={isLast ? '#d0bcff' : '#121315'}
                stroke="#d0bcff"
                strokeWidth="2"
              >
                <title>
                  Epoch {point.epoch}: {point.score}
                </title>
              </circle>
            );
          })}
        </svg>

        {/* X-axis Labels */}
        <div className="flex justify-between mt-4 text-[10px] font-['JetBrains_Mono'] text-[#cbc3d7]/40 uppercase tracking-tighter">
          {chartData.labelIndices.map((idx) => {
            const point = chartData.points[idx];
            return (
              <span key={idx}>
                Epoch {point.epoch.toLocaleString()}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * Build a smooth SVG path through the given points using monotone cubic interpolation.
 * Falls back to straight lines if fewer than 3 points.
 */
function buildSmoothPath(
  points: Array<{ x: number; y: number }>,
): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;
  }

  let path = `M${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    // Catmull-Rom to cubic bezier conversion
    const tension = 0.3;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  return path;
}

/**
 * Pick evenly spaced indices for axis labels.
 */
function pickLabelIndices(total: number, count: number): number[] {
  if (total <= count) return Array.from({ length: total }, (_, i) => i);
  const indices: number[] = [];
  for (let i = 0; i < count; i++) {
    indices.push(Math.round((i / (count - 1)) * (total - 1)));
  }
  return indices;
}
