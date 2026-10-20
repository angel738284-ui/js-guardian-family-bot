"use client";

import { useState } from "react";
import { compact } from "@/lib/stats";

export interface Bar {
  key: string;
  label: string;
  value: number;
  details: [string, number][];
}

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value / 4)! * magnitude;
  return Math.ceil(value / step) * step;
}

export function BarChart({ bars, label, unit, labelEvery }: { bars: Bar[]; label: string; unit: string; labelEvery: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 760;
  const height = 220;
  const left = 36;
  const bottom = 26;
  const top = 10;
  const plotWidth = width - left;
  const plotHeight = height - bottom - top;
  const max = niceMax(Math.max(...bars.map((bar) => bar.value), 0));
  const ticks = [0, max / 2, max];
  const band = plotWidth / Math.max(bars.length, 1);
  const barWidth = Math.max(2, Math.min(22, band - 2));
  const y = (value: number) => top + plotHeight - (value / max) * plotHeight;

  const barPath = (x: number, value: number) => {
    const h = Math.max(0, (value / max) * plotHeight);
    if (h === 0) return "";
    const r = Math.min(4, h, barWidth / 2);
    const base = top + plotHeight;
    const yTop = base - h;
    return `M${x},${base} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barWidth - r} Q${x + barWidth},${yTop} ${x + barWidth},${yTop + r} V${base} Z`;
  };

  const active = hover === null ? null : bars[hover];

  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={label}>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={left} x2={width} y1={y(tick)} y2={y(tick)} stroke="var(--grid)" strokeWidth={1} />
              <text x={left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--subtle)" className="tabular-nums">
                {compact(tick)}
              </text>
            </g>
          ))}
          {bars.map((bar, index) => {
            const x = left + index * band + (band - barWidth) / 2;
            return (
              <g key={bar.key} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)}>
                <rect x={left + index * band} y={top} width={band} height={plotHeight} fill="transparent" />
                <path d={barPath(x, bar.value)} fill="var(--fg)" opacity={hover === null || hover === index ? 0.9 : 0.35} />
                {index % labelEvery === 0 && (
                  <text x={x + barWidth / 2} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--subtle)">
                    {bar.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {active && hover !== null && (
          <div
            className="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 rounded-lg border border-border bg-bg px-3 py-2 text-xs shadow-lg"
            style={{ left: `${Math.min(88, Math.max(12, ((left + hover * band + band / 2) / width) * 100))}%`, top: 0 }}
          >
            <p className="text-muted">{active.label}</p>
            <p className="font-medium text-fg tabular-nums">
              {active.value.toLocaleString()} {unit}
            </p>
            {active.details.map(([name, value]) => (
              <p key={name} className="flex justify-between gap-4 text-muted tabular-nums">
                <span>{name}</span>
                <span className="text-fg">{value.toLocaleString()}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-muted hover:text-fg">Show as table</summary>
        <div className="mt-3 max-h-64 overflow-auto">
          <table className="w-full text-left tabular-nums">
            <thead>
              <tr className="text-fg">
                <th className="py-2 font-medium">Time</th>
                <th className="py-2 text-right font-medium">{unit}</th>
                {bars[0]?.details.map(([name]) => (
                  <th key={name} className="py-2 text-right font-medium">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bars.map((bar) => (
                <tr key={bar.key} className="border-t border-border text-muted">
                  <td className="py-1.5">{bar.label}</td>
                  <td className="py-1.5 text-right">{bar.value}</td>
                  {bar.details.map(([name, value]) => (
                    <td key={name} className="py-1.5 text-right">
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
