import { useRef, useState } from 'react';
import { clamp, fmt } from '../lib/util';

/** Anillo de progreso: valor frente a meta. */
export function Ring({
  value,
  target,
  size = 168,
  stroke = 14,
  color = 'var(--accent)',
  track = 'var(--track)',
  overColor = 'var(--critical)',
  label,
}: {
  value: number;
  target: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  overColor?: string;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const over = value > target;
  const pct = target > 0 ? clamp(value / target, 0, 1) : 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      {pct > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={over ? overColor : color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.45s ease-out' }}
        />
      )}
    </svg>
  );
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.999; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

export interface LinePoint {
  /** Posición en el eje X (por ejemplo, días desde el inicio). */
  x: number;
  y: number;
  label: string;
}

/** Línea de una sola serie con línea de meta opcional y lectura al tocar. */
export function LineChart({
  points,
  goal,
  goalLabel,
  unit,
  xLabels,
}: {
  points: LinePoint[];
  goal?: number;
  goalLabel?: string;
  unit: string;
  xLabels: [string, string];
}) {
  const W = 340;
  const H = 190;
  const pad = { l: 38, r: 12, t: 14, b: 24 };
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<number | null>(null);

  const ys = points.map((p) => p.y).concat(goal !== undefined ? [goal] : []);
  const ticks = niceTicks(Math.min(...ys), Math.max(...ys));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const xMin = points[0].x;
  const xMax = points[points.length - 1].x;
  const sx = (x: number) => (xMax === xMin ? (pad.l + W - pad.r) / 2 : pad.l + ((x - xMin) / (xMax - xMin)) * (W - pad.l - pad.r));
  const sy = (y: number) => pad.t + (1 - (y - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');

  const onMove = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(sx(p.x) - x) < Math.abs(sx(points[best].x) - x)) best = i;
    });
    setActive(best);
  };

  const ap = active !== null ? points[active] : null;
  const last = points[points.length - 1];
  return (
    <div
      className="chart"
      ref={ref}
      onPointerDown={(e) => onMove(e.clientX)}
      onPointerMove={(e) => (e.pointerType === 'mouse' || e.buttons > 0) && onMove(e.clientX)}
      onPointerLeave={() => setActive(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Evolución del peso">
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} />
            <text x={pad.l - 6} y={sy(t) + 4} textAnchor="end">
              {fmt(t, 1)}
            </text>
          </g>
        ))}
        {goal !== undefined && (
          <g>
            <line x1={pad.l} x2={W - pad.r} y1={sy(goal)} y2={sy(goal)} stroke="var(--text-3)" strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={W - pad.r} y={sy(goal) - 5} textAnchor="end" style={{ fill: 'var(--text-2)', fontWeight: 600 }}>
              {goalLabel}
            </text>
          </g>
        )}
        <defs>
          <linearGradient id="line-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity={0.2} />
            <stop offset="1" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {points.length > 1 && <path d={`${path} L${sx(xMax).toFixed(1)},${H - pad.b} L${sx(xMin).toFixed(1)},${H - pad.b} Z`} fill="url(#line-area)" />}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.length <= 14 &&
          points.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={3} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />)}
        <circle cx={sx(last.x)} cy={sy(last.y)} r={5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
        {ap && (
          <g>
            <line x1={sx(ap.x)} x2={sx(ap.x)} y1={pad.t} y2={H - pad.b} stroke="var(--text-3)" strokeWidth={1} />
            <circle cx={sx(ap.x)} cy={sy(ap.y)} r={6} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
        <text x={pad.l} y={H - 4} textAnchor="start">
          {xLabels[0]}
        </text>
        <text x={W - pad.r} y={H - 4} textAnchor="end">
          {xLabels[1]}
        </text>
      </svg>
      {ap && (
        <div className="chart-tip" style={{ left: `${clamp((sx(ap.x) / W) * 100, 16, 84)}%` }}>
          {ap.label} · {fmt(ap.y, 1)} {unit}
        </div>
      )}
    </div>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  tip: string;
}

/** Barras de una sola serie con línea de meta y lectura al tocar. */
export function BarChart({ data, goal, ariaLabel }: { data: BarDatum[]; goal?: number; ariaLabel: string }) {
  const W = 340;
  const H = 170;
  const pad = { l: 38, r: 8, t: 14, b: 24 };
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(goal ?? 0, ...data.map((d) => d.value), 1);
  const ticks = niceTicks(0, max, 3);
  const yMax = ticks[ticks.length - 1];
  const band = (W - pad.l - pad.r) / data.length;
  const bw = Math.min(26, band - 8);
  const sy = (y: number) => pad.t + (1 - y / yMax) * (H - pad.t - pad.b);
  const base = sy(0);

  return (
    <div className="chart" onPointerLeave={() => setActive(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} />
            <text x={pad.l - 6} y={sy(t) + 4} textAnchor="end">
              {fmt(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + band * i + (band - bw) / 2;
          const h = Math.max(0, base - sy(d.value));
          const r = Math.min(4, h);
          return (
            <g key={i} onPointerDown={() => setActive(i)} onPointerEnter={(e) => e.pointerType === 'mouse' && setActive(i)}>
              <rect x={pad.l + band * i} y={pad.t} width={band} height={H - pad.t - pad.b} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + bw - r} Q${x + bw},${base - h} ${x + bw},${base - h + r} V${base} Z`}
                  fill="var(--accent)"
                  opacity={active === null || active === i ? 1 : 0.45}
                />
              )}
              <text x={pad.l + band * i + band / 2} y={H - 6} textAnchor="middle" style={active === i ? { fill: 'var(--text)', fontWeight: 700 } : undefined}>
                {d.label}
              </text>
            </g>
          );
        })}
        {goal !== undefined && goal > 0 && (
          <line x1={pad.l} x2={W - pad.r} y1={sy(goal)} y2={sy(goal)} stroke="var(--text-3)" strokeWidth={1.5} strokeDasharray="5 4" />
        )}
      </svg>
      {active !== null && (
        <div className="chart-tip" style={{ left: `${clamp(((pad.l + band * active + band / 2) / W) * 100, 18, 82)}%` }}>
          {data[active].tip}
        </div>
      )}
    </div>
  );
}
