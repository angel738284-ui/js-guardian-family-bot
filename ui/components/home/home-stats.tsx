"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { compact, fetchStats, type Stats } from "@/lib/stats";

export function HomeStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchStats(controller.signal).then(setStats).catch(() => {});
    return () => controller.abort();
  }, []);

  const numbers = [
    { value: stats?.activeNow, label: "running right now" },
    { value: stats?.totalSessions, label: "numbers paired" },
    { value: stats?.pairsToday, label: "paired in the last day" },
  ];

  return (
    <div className="grid gap-px overflow-hidden rounded-3xl border border-border bg-border sm:grid-cols-3">
      {numbers.map((number) => (
        <Link key={number.label} href="/stats" className="group bg-black p-8 transition-colors hover:bg-surface sm:p-10">
          <p className="text-6xl font-semibold tracking-[-0.05em] text-fg sm:text-7xl">
            {number.value === undefined ? <span className="text-subtle">0</span> : compact(number.value)}
          </p>
          <p className="mt-3 text-muted group-hover:text-fg">{number.label}</p>
        </Link>
      ))}
    </div>
  );
}
