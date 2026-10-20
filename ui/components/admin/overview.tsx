"use client";

import { useEffect, useState } from "react";
import { api, errorText } from "@/lib/api";
import { platformLabel, type MetricPoint } from "@/lib/bots";
import { compact } from "@/lib/stats";
import { Activity, Alert, Clock, Message, Server, Smartphone, Terminal, Users } from "../icons";
import { BarChart } from "../dashboard/bar-chart";
import { Card, ErrorNote, Spinner, Stat } from "../dashboard/ui";

interface OverviewData {
  users: number;
  bots: number;
  sessions: number;
  liveSessions: number;
  onlineNow: number;
  pairingNow: number;
  last24h: { messagesIn: number; messagesOut: number; commands: number; errors: number };
  crons: number;
  failingCrons: number;
  daily: MetricPoint[];
  platforms: Record<string, number>;
  versions: Record<string, number>;
}

export function Overview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = () =>
      api<OverviewData>("/api/admin/overview")
        .then((next) => {
          setData(next);
          setError("");
        })
        .catch((reason) => setError(errorText(reason)));
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, []);

  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner />;

  const day = data.last24h;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-fg">Overview</h1>
        <p className="mt-1 text-sm text-muted">Every account, bot and session on this server. Refreshes every 15 seconds.</p>
      </div>

      <div className="grid gap-px overflow-hidden rounded-3xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Activity size={15} />} label="Bots online" value={compact(data.onlineNow)} hint={`${data.liveSessions} live sessions · ${data.pairingNow} pairing now`} />
        <Stat icon={<Message size={15} />} label="Messages, 24 h" value={compact(day.messagesIn + day.messagesOut)} hint={`${compact(day.messagesIn)} received · ${compact(day.messagesOut)} sent`} />
        <Stat icon={<Terminal size={15} />} label="Commands, 24 h" value={compact(day.commands)} hint={`${compact(day.errors)} errors`} />
        <Stat icon={<Users size={15} />} label="Accounts" value={compact(data.users)} hint={`${data.bots} bots · ${data.sessions} sessions ever`} />
      </div>

      {data.failingCrons > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          <Alert size={16} />
          {data.failingCrons} of {data.crons} keep-alive jobs failed on their last run.
        </div>
      )}

      <Card title="Messages per day, last 14 days">
        <BarChart
          bars={data.daily.map((point) => ({
            key: point.at,
            label: new Date(point.at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
            value: point.messagesIn + point.messagesOut,
            details: [
              ["Received", point.messagesIn],
              ["Sent", point.messagesOut],
              ["Commands", point.commands],
              ["Errors", point.errors],
            ],
          }))}
          label="Messages per day across all bots"
          unit="messages"
          labelEvery={2}
        />
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        <Breakdown title="Hosts" icon={<Server size={15} />} counts={data.platforms} label={(key) => platformLabel[key] ?? key} />
        <Breakdown title="Running versions" icon={<Smartphone size={15} />} counts={data.versions} label={(key) => (key === "unknown" ? key : `v${key}`)} />
        <Card title="Keep-alive jobs">
          <p className="flex items-center gap-2 text-3xl font-semibold tracking-[-0.03em] text-fg">
            <Clock size={20} />
            {data.crons}
          </p>
          <p className="mt-2 text-sm text-muted">{data.failingCrons ? `${data.failingCrons} failing` : "All passing"}</p>
        </Card>
      </div>
    </div>
  );
}

function Breakdown({ title, icon, counts, label }: { title: string; icon: React.ReactNode; counts: Record<string, number>; label: (key: string) => string }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(([, count]) => count), 1);
  return (
    <Card title={<span className="flex items-center gap-2">{icon}{title}</span>}>
      {entries.length ? (
        <ul className="space-y-3">
          {entries.map(([key, count]) => (
            <li key={key}>
              <div className="flex justify-between text-sm">
                <span className="text-fg">{label(key)}</span>
                <span className="text-muted tabular-nums">{count}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-fg/80" style={{ width: `${(count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No data yet.</p>
      )}
    </Card>
  );
}
