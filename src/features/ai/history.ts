import { proto, type Proto, type WaIncomingMessageEvent, type WaOutgoingMessageEvent } from "zapo-js";
import { botIdentity } from "../../bot/client.ts";
import { MEDIA_TYPES, parseMessage, type ParsedMessage, type QuotedMessage } from "../../core/message.ts";
import { TtlCache } from "../../lib/cache.ts";
import { logger } from "../../lib/logger.ts";
import { aiConfigured, utilsRequest } from "./api.ts";

/** One chat message as the AI server stores it. `raw` is the encoded proto, kept for media so it can be sent again. */
interface MessageRecord {
  chat: string;
  id: string;
  sender: string;
  senderName: string;
  fromMe: boolean;
  type: string;
  text: string;
  quotedId?: string;
  at: number;
  raw?: string;
}

const FLUSH_MS = 2_000;
const BATCH_SIZE = 100;
const MAX_BUFFER = 1_000;

let buffer: MessageRecord[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> | null = null;

const recent = new TtlCache<{ sender: string; content: Proto.IMessage }>(30 * 60_000, 500);
const outgoingWatchers = new Set<(chat: string, message: ParsedMessage) => void>();

function encode(content: Proto.IMessage): string {
  return Buffer.from(proto.Message.encode(content).finish()).toString("base64");
}

function record(chat: string, id: string, sender: string, senderName: string, fromMe: boolean, at: number, message: ParsedMessage): void {
  recent.set(`${chat}|${id}`, { sender, content: message.content });
  if (!aiConfigured()) return;

  buffer.push({
    chat,
    id,
    sender,
    senderName,
    fromMe,
    type: message.type,
    text: message.text,
    quotedId: message.quoted?.id || undefined,
    at,
    raw: MEDIA_TYPES.includes(message.type) ? encode(message.content) : undefined,
  });
  if (buffer.length > MAX_BUFFER) buffer = buffer.slice(-MAX_BUFFER);

  if (buffer.length >= BATCH_SIZE) void flushHistory();
  else flushTimer ??= setTimeout(() => void flushHistory(), FLUSH_MS);
}

export function recordIncoming(event: WaIncomingMessageEvent, message: ParsedMessage, sender: string): void {
  const at = event.timestampSeconds ?? Math.floor(Date.now() / 1000);
  record(event.key.remoteJid, event.key.id, sender, event.pushName ?? "", event.key.fromMe, at, message);
}

export function recordOutgoing(event: WaOutgoingMessageEvent): void {
  const message = parseMessage(event.message);
  if (!message || !event.id) return;
  for (const watcher of outgoingWatchers) watcher(event.to, message);
  record(event.to, event.id, botIdentity().jid ?? "", "", true, Math.floor(Date.now() / 1000), message);
}

/** Sends buffered messages to the AI server. Called on a timer and before every AI turn. */
export async function flushHistory(): Promise<void> {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  if (flushing) await flushing;
  if (buffer.length === 0) return;

  const batch = buffer.splice(0, BATCH_SIZE);
  flushing = utilsRequest("POST", "/v1/messages", { messages: batch })
    .then(() => {})
    .catch((error) => {
      buffer.unshift(...batch);
      logger.debug(`Could not upload chat history: ${error instanceof Error ? error.message : error}`);
    })
    .finally(() => {
      flushing = null;
    });
  await flushing;

  if (buffer.length > 0) flushTimer ??= setTimeout(() => void flushHistory(), FLUSH_MS * 5);
}

/** Collects everything the bot sends to `chat` until `stop()` is called. */
export function watchOutgoing(chat: string): { stop: () => ParsedMessage[] } {
  const seen: ParsedMessage[] = [];
  const watcher = (to: string, message: ParsedMessage) => {
    if (to === chat) seen.push(message);
  };
  outgoingWatchers.add(watcher);
  return {
    stop: () => {
      outgoingWatchers.delete(watcher);
      return seen;
    },
  };
}

/** Finds an earlier message of `chat`: from memory first, then from the AI server. */
export async function findMessage(chat: string, id: string): Promise<QuotedMessage | null> {
  const local = recent.get(`${chat}|${id}`);
  if (local) {
    const parsed = parseMessage(local.content);
    return parsed ? { id, sender: local.sender, type: parsed.type, text: parsed.text, content: parsed.content } : null;
  }

  const stored = await utilsRequest<{ sender: string; type: string; text: string; raw: string | null }>(
    "GET",
    `/v1/messages/${encodeURIComponent(chat)}/${encodeURIComponent(id)}`,
  ).catch(() => null);
  if (!stored) return null;

  const content: Proto.IMessage = stored.raw
    ? proto.Message.decode(Buffer.from(stored.raw, "base64"))
    : { conversation: stored.text };
  const parsed = parseMessage(content);
  return parsed ? { id, sender: stored.sender, type: parsed.type, text: parsed.text, content: parsed.content } : null;
}
