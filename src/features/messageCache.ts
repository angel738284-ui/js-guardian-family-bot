import type { Proto } from "zapo-js";
import { TtlCache } from "../lib/cache.ts";

export interface CachedMessage {
  chat: string;
  id: string;
  sender: string;
  senderName: string;
  at: number;
  content: Proto.IMessage;
}

const DAY_MS = 24 * 60 * 60_000;
const MAX_MESSAGES = 3_000;
const cache = new TtlCache<CachedMessage>(DAY_MS, MAX_MESSAGES);

// Recent messages, so deleted or edited ones can be shown again.
export function cacheMessage(message: CachedMessage): void {
  cache.set(`${message.chat}|${message.id}`, message);
}

export function getCachedMessage(chat: string, id: string): CachedMessage | undefined {
  return cache.get(`${chat}|${id}`);
}
