import { getClient, sendText } from "../bot/client.ts";
import { kv } from "../db/kv.ts";
import { errorMessage, logger } from "../lib/logger.ts";

export interface Reminder {
  id: string;
  chat: string;
  text: string;
  at: number;
  createdBy: string;
}

let timer: ReturnType<typeof setInterval> | null = null;
let checking = false;

async function loadAll(): Promise<Reminder[]> {
  return (await kv.get<Reminder[]>("reminders")) ?? [];
}

async function saveAll(list: Reminder[]): Promise<void> {
  await kv.set("reminders", list);
}

export async function addReminder(reminder: Reminder): Promise<void> {
  const list = await loadAll();
  list.push(reminder);
  await saveAll(list);
}

export async function listReminders(chat: string): Promise<Reminder[]> {
  return (await loadAll()).filter((reminder) => reminder.chat === chat).sort((a, b) => a.at - b.at);
}

export async function findReminder(id: string): Promise<Reminder | null> {
  return (await loadAll()).find((reminder) => reminder.id === id) ?? null;
}

export async function cancelReminder(id: string): Promise<boolean> {
  const list = await loadAll();
  const remaining = list.filter((reminder) => reminder.id !== id);
  await saveAll(remaining);
  return remaining.length !== list.length;
}

async function sendDueReminders(): Promise<void> {
  if (checking || !getClient()) return;
  checking = true;
  try {
    const now = Date.now();
    const list = await loadAll();
    const due = list.filter((reminder) => reminder.at <= now);
    if (due.length === 0) return;

    await saveAll(list.filter((reminder) => reminder.at > now));
    for (const reminder of due) {
      await sendText(reminder.chat, `*Reminder*\n${reminder.text}`).catch((error) =>
        logger.warn(`Reminder ${reminder.id} could not be sent: ${errorMessage(error)}`),
      );
    }
  } catch (error) {
    logger.warn(`Reminder check failed: ${errorMessage(error)}`);
  } finally {
    checking = false;
  }
}

export function startReminders(): void {
  stopReminders();
  timer = setInterval(sendDueReminders, 30_000);
  void sendDueReminders();
}

export function stopReminders(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
