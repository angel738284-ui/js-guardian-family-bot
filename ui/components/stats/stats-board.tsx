"use client";

import { useEffect, useState } from "react";
import { compact, fetchStats, type Stats } from "@/lib/stats";
import { Activity, Alert, Refresh, Users } from "../icons";

const REFRESH_MS = 30_000;

export function StatsBoard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let controller = new AbortController();
    const load = () => {
      controller.abort();
      controller = new AbortController();
      fetchStats(controller.signal)
        .then((next) => {
          setStats(next);
          setError(null);
        })
        .catch((reason) => {
          if (reason?.name !== "AbortError") setError("Stats are unavailable right now.");
        });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, []);

  const tiles = [
    { label: "Bots online now", value: stats?.activeNow, hint: "Sent a heartbeat in the last 3 minutes", hero: true },
    { label: "Active today", value: stats?.activeToday, hint: "Online at least once in 24 hours" },
    { label: "Sessions paired", value: stats?.totalSessions, hint: "All time" },
    { label: "Users", value: stats?.totalUsers, hint: "Unique WhatsApp numbers" },
    { label: "Paired today", value: stats?.pairsToday, hint: "Last 24 hours" },
    { label: "Pairing right now", value: stats?.pairingNow, hint: "Open pairing sessions" },
  ];

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          <Alert size={16} />
          {error}
        </div>
      )}

      <div className="grid gap-px overflow-hidden rounded-3xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-surface p-6 sm:p-7">
            <p className="text-sm text-muted">{tile.label}</p>
            <p className={`mt-3 font-semibold tracking-[-0.03em] text-fg ${tile.hero ? "text-6xl" : "text-4xl"}`}>
              {tile.value === undefined ? "—" : compact(tile.value)}
            </p>
            <p className="mt-2 text-xs text-subtle">{tile.hint}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-medium text-fg">Devices paired per day</h2>
            <p className="mt-1 text-sm text-muted">Last 14 days</p>
          </div>
          <p className="inline-flex items-center gap-1.5 text-xs text-subtle">
            <Refresh size={13} />
            {stats ? `Updated ${new Date(stats.updatedAt).toLocaleTimeString()}` : "Loading…"}
          </p>
        </div>
        <div className="mt-8">{stats ? <DailyChart daily={stats.daily} /> : <div className="h-64" />}</div>
        {stats && (
          <details className="mt-6 text-sm">
            <summary className="cursor-pointer text-muted hover:text-fg">Show as table</summary>
            <table className="mt-4 w-full max-w-sm text-left tabular-nums">
              <thead>
                <tr className="text-fg">
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 text-right font-medium">Devices paired</th>
                </tr>
              </thead>
              <tbody>
                {stats.daily.map((day) => (
                  <tr key={day.date} className="border-t border-border text-muted">
                    <td className="py-2">{formatDay(day.date)}</td>
                    <td className="py-2 text-right">{day.pairs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Note icon={<Activity size={16} />} title="How bots are counted">
          Bots paired through this site send a small heartbeat every minute with their version. Bots
          paired locally in the terminal never contact this server.
        </Note>
        <Note icon={<Users size={16} />} title="How users are counted">
          Each WhatsApp number is stored only as a salted hash, so we can count unique users without keeping phone
          numbers.
        </Note>
      </div>
    </div>
  );
}

function Note({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border p-5">
      <p className="flex items-center gap-2 text-sm font-medium text-fg">
        {icon}
        {title}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>
    </div>
  );
}

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function niceMax(value: number): number {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value / 4)! * magnitude;
  return Math.ceil(value / step) * step;
}

function DailyChart({ daily }: { daily: { date: string; pairs: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 720;
  const height = 240;
  const left = 36;
  const bottom = 28;
  const top = 12;
  const plotWidth = width - left;
  const plotHeight = height - bottom - top;
  const max = niceMax(Math.max(...daily.map((day) => day.pairs), 0));
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const band = plotWidth / daily.length;
  const barWidth = Math.min(24, band * 0.6);
  const y = (value: number) => top + plotHeight - (value / max) * plotHeight;

  // Column with 4px rounded top and square base.
  const barPath = (x: number, value: number) => {
    const h = Math.max(0, (value / max) * plotHeight);
    if (h === 0) return "";
    const r = Math.min(4, h, barWidth / 2);
    const base = top + plotHeight;
    const yTop = base - h;
    return `M${x},${base} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + barWidth - r} Q${x + barWidth},${yTop} ${x + barWidth},${yTop + r} V${base} Z`;
  };

  const active = hover === null ? null : daily[hover];

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="Devices paired per day, last 14 days">
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={left} x2={width} y1={y(tick)} y2={y(tick)} stroke="var(--grid)" strokeWidth={1} />
            <text x={left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--subtle)" className="tabular-nums">
              {compact(tick)}
            </text>
          </g>
        ))}
        {daily.map((day, index) => {
          const x = left + index * band + (band - barWidth) / 2;
          const showLabel = index === 0 || index === daily.length - 1 || index % 3 === 0;
          return (
            <g key={day.date} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)}>
              <rect x={left + index * band} y={top} width={band} height={plotHeight} fill="transparent" />
              <path d={barPath(x, day.pairs)} fill="var(--fg)" opacity={hover === null || hover === index ? 0.9 : 0.35} />
              {showLabel && (
                <text x={x + barWidth / 2} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--subtle)">
                  {formatDay(day.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {active && hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-border bg-bg px-3 py-2 text-xs shadow-lg"
          style={{ left: `${((left + hover * band + band / 2) / width) * 100}%`, top: 0 }}
        >
          <p className="text-muted">{formatDay(active.date)}</p>
          <p className="font-medium text-fg tabular-nums">
            {active.pairs} {active.pairs === 1 ? "device" : "devices"}
          </p>
        </div>
      )}
    </div>
  );
}
