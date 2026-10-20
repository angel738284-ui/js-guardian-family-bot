import { config } from "../config.ts";

const counters: Record<string, number> = {};
const jobDurations: number[] = [];
const recentErrors: number[] = [];
const startedAt = Date.now();

const ERROR_WINDOW_MS = 60_000;
const ALERT_COOLDOWN_MS = 120_000;
let lastAlertAt = 0;

let onErrorBurst: ((count: number) => void) | null = null;

export function setErrorBurstHandler(handler: (count: number) => void): void {
  onErrorBurst = handler;
}

export function increment(name: string, amount = 1): void {
  counters[name] = (counters[name] ?? 0) + amount;
}

/** Counters for the dashboard, as totals since start. The heartbeat sends the difference since its last report. */
export function dashboardCounters(): { messagesIn: number; messagesOut: number; commands: number; errors: number; byCommand: Record<string, number> } {
  const byCommand: Record<string, number> = {};
  for (const [name, value] of Object.entries(counters)) {
    if (name.startsWith("cmd_")) byCommand[name.slice(4)] = value;
  }
  return {
    messagesIn: counters.messages_in ?? 0,
    messagesOut: counters.messages_out ?? 0,
    commands: counters.commands ?? 0,
    errors: counters.errors ?? 0,
    byCommand,
  };
}

export function recordCommand(name: string): void {
  increment("commands");
  increment(`cmd_${name}`);
}

export function recordJobDuration(ms: number): void {
  jobDurations.push(ms);
  if (jobDurations.length > 100) jobDurations.shift();
}

export function recordError(): void {
  increment("errors");

  const now = Date.now();
  recentErrors.push(now);
  while (recentErrors.length && now - recentErrors[0]! > ERROR_WINDOW_MS) recentErrors.shift();

  if (recentErrors.length >= config.errorAlertThreshold && now - lastAlertAt > ALERT_COOLDOWN_MS) {
    lastAlertAt = now;
    onErrorBurst?.(recentErrors.length);
  }
}

export function metricsSnapshot() {
  const now = Date.now();
  const averageJobMs = jobDurations.length
    ? Math.round(jobDurations.reduce((sum, ms) => sum + ms, 0) / jobDurations.length)
    : 0;

  return {
    uptimeSeconds: Math.floor((now - startedAt) / 1000),
    counters: { ...counters },
    errorsLastMinute: recentErrors.filter((time) => now - time < ERROR_WINDOW_MS).length,
    averageJobMs,
    startedAt,
  };
}

export function metricsPrometheus(): string {
  const snapshot = metricsSnapshot();
  const lines = [
    "# TYPE asena_uptime_seconds gauge",
    `asena_uptime_seconds ${snapshot.uptimeSeconds}`,
    "# TYPE asena_errors_last_minute gauge",
    `asena_errors_last_minute ${snapshot.errorsLastMinute}`,
  ];
  for (const [name, value] of Object.entries(snapshot.counters)) {
    const metric = `asena_${name.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    lines.push(`# TYPE ${metric} counter`, `${metric} ${value}`);
  }
  return `${lines.join("\n")}\n`;
}
