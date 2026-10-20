import { site } from "./site";

export interface Stats {
  activeNow: number;
  activeToday: number;
  totalSessions: number;
  totalUsers: number;
  pairsToday: number;
  pairingNow: number;
  daily: { date: string; pairs: number }[];
  updatedAt: string;
}

export async function fetchStats(signal?: AbortSignal): Promise<Stats> {
  const response = await fetch(`${site.apiUrl}/api/stats`, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`Stats unavailable (${response.status})`);
  return response.json();
}

export function compact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
