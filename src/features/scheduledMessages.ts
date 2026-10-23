import { getClient, sendText } from "../bot/client.ts";
import { kv } from "../db/kv.ts";
import { errorMessage, logger } from "../lib/logger.ts";

export interface ScheduledMessage {
  id: string;
  chat: string;
  text: string;
  at: number;
}

export async function getScheduledMessages(): Promise<ScheduledMessage[]> {
  return (await kv.get<ScheduledMessage[]>("scheduled_messages")) ?? [];
}

async function save(list: ScheduledMessage[]): Promise<void> {
  await kv.set("scheduled_messages", list.length ? list : null);
}

export async function addScheduledMessage(message: ScheduledMessage): Promise<void> {
  await save([...(await getScheduledMessages()), message]);
}

export async function removeScheduledMessage(id: string): Promise<boolean> {
  const list = await getScheduledMessages();
  const remaining = list.filter((item) => item.id !== id);
  await save(remaining);
  return remaining.length !== list.length;
}

// Sends every message whose time has come. Runs on the scheduler tick.
export async function sendDueMessages(): Promise<void> {
  if (!getClient()) return;
  const list = await getScheduledMessages();
  const due = list.filter((item) => item.at <= Date.now());
  if (due.length === 0) return;

  await save(list.filter((item) => item.at > Date.now()));
  for (const item of due) {
    await sendText(item.chat, item.text).catch((error) => logger.warn(`Scheduled message ${item.id} failed: ${errorMessage(error)}`));
  }
}
