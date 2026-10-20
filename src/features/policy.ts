import { kv } from "../db/kv.ts";
import type { TextKey } from "./i18n.ts";

export interface Policies {
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  rateLimitPerUser: number;
  allowMediaCommands: boolean;
  blockBroadcast: boolean;
}

const DEFAULT_POLICIES: Policies = {
  quietHoursStart: null,
  quietHoursEnd: null,
  rateLimitPerUser: 20,
  allowMediaCommands: true,
  blockBroadcast: false,
};

export const POLICY_NAMES = Object.keys(DEFAULT_POLICIES) as (keyof Policies)[];

const QUIET_HOURS_ALLOWED = new Set(["menu", "help", "ping", "status"]);

let cache: Policies | null = null;

export async function getPolicies(): Promise<Policies> {
  if (!cache) {
    const stored = (await kv.get<Record<string, unknown>>("policies")) ?? {};
    const known = Object.fromEntries(Object.entries(stored).filter(([key]) => key in DEFAULT_POLICIES));
    cache = { ...DEFAULT_POLICIES, ...(known as Partial<Policies>) };
  }
  return { ...cache };
}

export async function setPolicy(name: string, rawValue: string): Promise<Policies> {
  if (!POLICY_NAMES.includes(name as keyof Policies)) {
    throw new Error(`Unknown policy. Use one of: ${POLICY_NAMES.join(", ")}`);
  }
  const key = name as keyof Policies;
  const value = rawValue.trim().toLowerCase();
  const policies = await getPolicies();

  if (key === "quietHoursStart" || key === "quietHoursEnd") {
    if (value === "none" || value === "off" || value === "null") policies[key] = null;
    else if (/^\d{1,2}:\d{2}$/.test(value)) policies[key] = value;
    else throw new Error("Use a time like 22:00, or none.");
  } else if (key === "rateLimitPerUser") {
    const count = Number(value);
    if (!Number.isInteger(count) || count < 0) throw new Error("Use a whole number (0 = no limit).");
    policies[key] = count;
  } else {
    if (!["true", "false", "on", "off"].includes(value)) throw new Error("Use on or off.");
    policies[key] = value === "true" || value === "on";
  }

  cache = policies;
  await kv.set("policies", policies);
  return policies;
}

function minutesOfDay(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function inQuietHours(policies: Policies): boolean {
  if (!policies.quietHoursStart || !policies.quietHoursEnd) return false;
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const start = minutesOfDay(policies.quietHoursStart);
  const end = minutesOfDay(policies.quietHoursEnd);
  if (start === end) return false;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

const recentCommands = new Map<string, number[]>();

function isRateLimited(userKey: string, limitPerMinute: number): boolean {
  if (limitPerMinute <= 0) return false;
  const now = Date.now();
  const recent = (recentCommands.get(userKey) ?? []).filter((time) => now - time < 60_000);
  recent.push(now);
  recentCommands.set(userKey, recent);
  return recent.length > limitPerMinute;
}

export async function checkPolicies(input: {
  commandName: string;
  category: string;
  userKey: string;
}): Promise<TextKey | null> {
  const policies = await getPolicies();

  if (inQuietHours(policies) && !QUIET_HOURS_ALLOWED.has(input.commandName)) return "QUIET_HOURS";
  if (policies.blockBroadcast && input.commandName === "broadcast") return "BROADCAST_BLOCKED";
  if (!policies.allowMediaCommands && input.category === "media") return "MEDIA_DISABLED";
  if (isRateLimited(input.userKey, policies.rateLimitPerUser)) return "RATE_LIMIT";
  return null;
}
