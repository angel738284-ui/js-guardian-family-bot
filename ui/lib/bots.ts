export type BotStatus = "online" | "connecting" | "offline" | "waiting" | "unpaired" | "logged_out" | "expired" | "revoked";

export interface BotSession {
  phone: string;
  method: string;
  pairedAt: string;
  claimedAt: string | null;
  lastSeenAt: string | null;
  version: string | null;
  syncedAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
}

export interface Bot {
  id: string;
  name: string;
  createdAt: string;
  status: BotStatus;
  platform: string;
  externalUrl: string;
  memoryMb: number;
  uptimeSeconds: number;
  session: BotSession | null;
  ownerId?: string;
  ownerName?: string;
}

export interface BotEvent {
  at: string;
  kind: string;
  detail: string;
}

export interface CronRun {
  at: string;
  status: number;
  ms: number;
  error: string;
}

export interface Cron {
  id: string;
  url: string;
  intervalMinutes: number;
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: number | null;
  lastMs: number | null;
  lastError: string | null;
  runs: CronRun[];
}

export interface BotDetail {
  bot: Bot;
  events: BotEvent[];
  crons: Cron[];
  limits?: { crons: number; minInterval: number; maxInterval: number };
}

export interface Counts {
  messagesIn: number;
  messagesOut: number;
  commands: number;
  errors: number;
  byCommand?: Record<string, number>;
}

export interface MetricPoint extends Counts {
  at: string;
}

export interface Metrics {
  range: string;
  points: MetricPoint[];
  topCommands: { command: string; count: number }[];
}

export const statusInfo: Record<BotStatus, { label: string; tone: "ok" | "warn" | "off" | "bad"; hint: string }> = {
  online: { label: "Online", tone: "ok", hint: "Running and connected to WhatsApp." },
  connecting: { label: "Connecting", tone: "warn", hint: "Running, but not connected to WhatsApp right now." },
  offline: { label: "Offline", tone: "off", hint: "Not running. Start the bot, or wake it if your host put it to sleep." },
  waiting: { label: "Not started", tone: "warn", hint: "Linked to WhatsApp. Put the session ID in your settings and start the bot." },
  unpaired: { label: "Not linked", tone: "off", hint: "Link WhatsApp to get a session ID." },
  logged_out: { label: "Logged out", tone: "bad", hint: "WhatsApp unlinked this session. Refresh the session to link it again." },
  expired: { label: "Expired", tone: "bad", hint: "The session ID was not used within 24 hours. Refresh the session." },
  revoked: { label: "Revoked", tone: "bad", hint: "This session no longer works. Refresh the session to get a new ID." },
};

export function needsRefresh(status: BotStatus): boolean {
  return status === "logged_out" || status === "expired" || status === "revoked";
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function duration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export const platformLabel: Record<string, string> = {
  render: "Render",
  railway: "Railway",
  fly: "Fly.io",
  koyeb: "Koyeb",
  heroku: "Heroku",
  huggingface: "Hugging Face",
  linux: "Linux",
  darwin: "macOS",
  win32: "Windows",
};
