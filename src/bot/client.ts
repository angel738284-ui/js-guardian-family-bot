import type { WaClient, WaSendMessageContent, WaSendMessageOptions } from "zapo-js";
import { userPart } from "../lib/jid.ts";
import { increment } from "../features/metrics.ts";

let client: WaClient | null = null;

export function setClient(next: WaClient | null): void {
  client = next;
}

export function getClient(): WaClient | null {
  return client;
}

export function requireClient(): WaClient {
  if (!client) throw new Error("The bot is not connected to WhatsApp.");
  return client;
}

const sentIds = new Set<string>();
const MAX_SENT_IDS = 500;

export function rememberSentId(id: string): void {
  sentIds.add(id);
  if (sentIds.size > MAX_SENT_IDS) {
    const oldest = sentIds.values().next().value;
    if (oldest !== undefined) sentIds.delete(oldest);
  }
}

export function wasSentByBot(id: string): boolean {
  return sentIds.has(id);
}

export async function send(
  jid: string,
  content: WaSendMessageContent,
  options?: WaSendMessageOptions,
): Promise<string> {
  const result = await requireClient().message.send(jid, content, options);
  rememberSentId(result.id);
  increment("messages_out");
  return result.id;
}

export async function sendText(jid: string, text: string, mentions: string[] = []): Promise<string> {
  return send(jid, { type: "text", text }, mentions.length ? { mentions } : undefined);
}

export function botIdentity(): { jid: string | null; lid: string | null; phone: string } {
  const credentials = client?.getCredentials();
  const jid = credentials?.meJid ?? null;
  return { jid, lid: credentials?.meLid ?? null, phone: userPart(jid) };
}
