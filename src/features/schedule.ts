import { getClient, sendText } from "../bot/client.ts";
import { kv } from "../db/kv.ts";
import { errorMessage, logger } from "../lib/logger.ts";
import { getAutoSettings } from "./automation.ts";
import { sendDueMessages } from "./scheduledMessages.ts";

export interface GroupSchedule {
  close?: string;
  open?: string;
  lastClose?: string;
  lastOpen?: string;
}

const TICK_MS = 15_000;
const BIO_EVERY_MS = 10 * 60_000;
const QUOTES = [
  "Stay hungry, stay foolish.",
  "Make it work, make it right, make it fast.",
  "Small steps every day.",
  "Done is better than perfect.",
  "Talk is cheap. Show me the code.",
];

let timer: ReturnType<typeof setInterval> | null = null;
let lastBio = 0;

export async function getTimezone(): Promise<string> {
  return (await kv.get<string>("timezone")) ?? (process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone);
}

export async function setTimezone(zone: string): Promise<void> {
  new Intl.DateTimeFormat("en-GB", { timeZone: zone });
  await kv.set("timezone", zone);
}

export function parseClock(input: string): string | null {
  const match = input.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (match[3] === "pm" && hours < 12) hours += 12;
  if (match[3] === "am" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function now(zone: string): { clock: string; day: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return { clock: `${get("hour").replace("24", "00")}:${get("minute")}`, day: `${get("year")}-${get("month")}-${get("day")}` };
}

export async function getSchedules(): Promise<Record<string, GroupSchedule>> {
  return (await kv.get<Record<string, GroupSchedule>>("group_schedule")) ?? {};
}

export async function setSchedule(group: string, changes: Partial<GroupSchedule>): Promise<GroupSchedule> {
  const all = await getSchedules();
  const next = { ...all[group], ...changes };
  if (!next.close && !next.open) delete all[group];
  else all[group] = next;
  await kv.set("group_schedule", Object.keys(all).length ? all : null);
  return next;
}

async function runSchedules(): Promise<void> {
  const client = getClient();
  if (!client) return;
  const zone = await getTimezone();
  const { clock, day } = now(zone);
  const all = await getSchedules();
  let changed = false;

  for (const [group, schedule] of Object.entries(all)) {
    const action = schedule.close === clock && schedule.lastClose !== day ? "close" : schedule.open === clock && schedule.lastOpen !== day ? "open" : null;
    if (!action) continue;

    try {
      await client.group.setSetting(group, "announcement", action === "close");
      await sendText(group, action === "close" ? "_Group closed for the night. Only admins can send messages._" : "_Group is open again._");
    } catch (error) {
      logger.warn(`Scheduled ${action} failed in ${group}: ${errorMessage(error)}`);
    }
    if (action === "close") schedule.lastClose = day;
    else schedule.lastOpen = day;
    changed = true;
  }

  if (changed) await kv.set("group_schedule", all);
}

async function runAutoBio(): Promise<void> {
  const client = getClient();
  if (!client || Date.now() - lastBio < BIO_EVERY_MS || !(await getAutoSettings()).autobio) return;
  lastBio = Date.now();
  const zone = await getTimezone();
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", weekday: "short" }).format(new Date());
  const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  await client.profile.setStatus(`⏰ ${time} · ${quote}`).catch((error) => logger.debug(`Auto bio failed: ${errorMessage(error)}`));
}

export function startScheduler(): void {
  stopScheduler();
  timer = setInterval(() => {
    void runSchedules().catch(() => {});
    void runAutoBio().catch(() => {});
    void sendDueMessages().catch(() => {});
  }, TICK_MS);
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
