"use client";

import { useState, type FormEvent } from "react";
import { errorText, patch, post, remove } from "@/lib/api";
import { ago, type Cron } from "@/lib/bots";
import { Plus, Trash } from "../icons";
import { Button, Card, ErrorNote, inputClass } from "./ui";

const INTERVALS = [5, 10, 14, 30, 60, 180, 720, 1440];

function intervalLabel(minutes: number): string {
  if (minutes < 60) return `every ${minutes} min`;
  if (minutes === 60) return "every hour";
  if (minutes < 1440) return `every ${minutes / 60} hours`;
  return "every day";
}

function healthy(status: number | null): boolean {
  return status !== null && status > 0 && status < 400;
}

export function CronCard({
  mode,
  apiBase,
  crons,
  limits,
  externalUrl,
  platform,
  onChange,
}: {
  mode: "user" | "admin";
  apiBase: string;
  crons: Cron[];
  limits?: { crons: number };
  externalUrl: string;
  platform: string;
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [interval, setIntervalMinutes] = useState(10);
  const [error, setError] = useState("");
  const healthUrl = externalUrl ? `${externalUrl.replace(/\/$/, "")}/health` : "";
  const suggest = mode === "user" && healthUrl && !crons.some((cron) => cron.url.startsWith(externalUrl));

  async function create(target: string, minutes: number) {
    setError("");
    try {
      await post(`${apiBase}/crons`, { url: target, intervalMinutes: minutes });
      setAdding(false);
      setUrl("");
      onChange();
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      onChange();
    } catch (reason) {
      setError(errorText(reason));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void create(url, interval);
  }

  return (
    <Card
      title="Keep-alive jobs"
      action={
        mode === "user" && !adding && crons.length < (limits?.crons ?? 5) ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus size={14} />
            Add job
          </Button>
        ) : null
      }
    >
      <p className="-mt-2 mb-5 text-sm text-muted">
        We open a URL on a schedule. Free hosts like Render put a bot to sleep after 15 minutes without traffic; a ping every 10 minutes keeps it awake.
      </p>

      {suggest && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-bg p-4">
          <div className="min-w-0 text-sm">
            <p className="font-medium text-fg">{platform === "render" ? "Keep this Render bot awake" : "Ping this bot"}</p>
            <p className="truncate font-mono text-xs text-muted">{healthUrl}</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => create(healthUrl, 10)}>
            Add, every 10 min
          </Button>
        </div>
      )}

      {adding && (
        <form onSubmit={submit} className="mb-5 space-y-3 rounded-2xl border border-border bg-bg p-4">
          <input
            autoFocus
            required
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://your-bot.onrender.com/health"
            className={`${inputClass} font-mono`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select value={interval} onChange={(event) => setIntervalMinutes(Number(event.target.value))} className={`${inputClass} w-auto`}>
              {INTERVALS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {intervalLabel(minutes)}
                </option>
              ))}
            </select>
            <div className="ml-auto flex gap-2">
              <Button onClick={() => setAdding(false)}>Cancel</Button>
              <Button type="submit" variant="primary">
                Save
              </Button>
            </div>
          </div>
        </form>
      )}

      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {crons.length === 0 && !adding && !suggest && <p className="text-sm text-subtle">No jobs yet.</p>}

      <ul className="space-y-3">
        {crons.map((cron) => (
          <li key={cron.id} className="rounded-2xl border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-mono text-sm text-fg" title={cron.url}>
                  {cron.url}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {intervalLabel(cron.intervalMinutes)} ·{" "}
                  {!cron.enabled
                    ? "paused"
                    : cron.lastRunAt
                      ? `${healthy(cron.lastStatus) ? `${cron.lastStatus} OK` : cron.lastError || `HTTP ${cron.lastStatus}`} in ${cron.lastMs} ms, ${ago(cron.lastRunAt)}`
                      : "first run soon"}
                </p>
              </div>
              {mode === "user" && (
                <div className="flex shrink-0 gap-1">
                  <Button size="sm" onClick={() => run(() => patch(`${apiBase}/crons/${cron.id}`, { enabled: !cron.enabled }))}>
                    {cron.enabled ? "Pause" : "Resume"}
                  </Button>
                  <Button size="sm" variant="danger" aria-label="Delete job" onClick={() => run(() => remove(`${apiBase}/crons/${cron.id}`))}>
                    <Trash size={13} />
                  </Button>
                </div>
              )}
            </div>
            {cron.runs.length > 0 && (
              <div className="mt-3 flex gap-1" aria-label="Recent runs, newest last">
                {[...cron.runs].reverse().map((runItem) => (
                  <span
                    key={runItem.at}
                    title={`${new Date(runItem.at).toLocaleString()}: ${runItem.error || `HTTP ${runItem.status}`} (${runItem.ms} ms)`}
                    className={`h-5 w-1.5 rounded-full ${healthy(runItem.status) ? "bg-ok/80" : "bg-danger"}`}
                  />
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
