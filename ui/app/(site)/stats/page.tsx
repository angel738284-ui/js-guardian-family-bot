import type { Metadata } from "next";
import { StatsBoard } from "@/components/stats/stats-board";

export const metadata: Metadata = {
  title: "Live stats",
  description: "How many Asena bots are online right now, and how many devices have been paired.",
};

export default function StatsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-subtle">Stats</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.035em] text-fg sm:text-5xl">Asena, live</h1>
        <p className="mt-4 text-lg text-muted">Public numbers from the pairing server. Refreshes every 30 seconds.</p>
      </div>
      <div className="mt-12">
        <StatsBoard />
      </div>
    </div>
  );
}
