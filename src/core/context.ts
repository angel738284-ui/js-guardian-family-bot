import type {
  WaClient,
  WaGroupMetadata,
  WaIncomingMessageEvent,
  WaSendMessageContent,
  WaSendMessageOptions,
} from "zapo-js";
import { botIdentity, send } from "../bot/client.ts";
import { getGroup } from "../features/groups.ts";
import { t } from "../features/i18n.ts";
import { normalizeId } from "../lib/jid.ts";
import { MEDIA_TYPES, type MessageType, type ParsedMessage } from "./message.ts";

export interface DownloadedMedia {
  bytes: Uint8Array;
  type: MessageType;
  mimetype: string;
}

export interface ReplyOptions {
  mentions?: string[];
}

export interface Ctx {
  client: WaClient;
  event: WaIncomingMessageEvent;

  chat: string;
  isGroup: boolean;
  fromMe: boolean;
  sender: string;
  senderIds: string[];
  pushName: string;

  message: ParsedMessage;
  text: string;
  command: string;
  args: string;

  reply(text: string, options?: ReplyOptions): Promise<void>;
  replyOk(text?: string, options?: ReplyOptions): Promise<void>;
  replyFail(text?: string, options?: ReplyOptions): Promise<void>;
  send(content: WaSendMessageContent, options?: WaSendMessageOptions): Promise<void>;
  react(emoji: string): Promise<void>;
  withTyping<T>(work: () => Promise<T>): Promise<T>;
  downloadMedia(): Promise<DownloadedMedia | null>;
  target(): string | null;
  group(): Promise<WaGroupMetadata>;
}

function resolveSender(event: WaIncomingMessageEvent): { sender: string; senderIds: string[] } {
  const key = event.key;
  let primary = key.isGroup ? key.participant : key.remoteJid;
  let alternate = key.isGroup ? key.participantAlt : key.remoteJidAlt;

  if (key.fromMe) {
    const me = botIdentity();
    primary = me.jid ?? primary;
    alternate = me.lid ?? alternate;
  }

  primary = primary?.replace(/:\d+@/, "@");
  alternate = alternate?.replace(/:\d+@/, "@");

  const ids = [primary, alternate].filter((id): id is string => Boolean(id));
  const sender = ids.find((id) => id.endsWith("@s.whatsapp.net")) ?? ids[0] ?? "";
  return { sender, senderIds: [...new Set(ids.map(normalizeId))] };
}

export function createContext(
  client: WaClient,
  event: WaIncomingMessageEvent,
  message: ParsedMessage,
  command: { name: string; args: string } | null,
): Ctx {
  const chat = event.key.remoteJid;
  const { sender, senderIds } = resolveSender(event);

  const ctx: Ctx = {
    client,
    event,
    chat,
    isGroup: event.key.isGroup,
    fromMe: event.key.fromMe,
    sender,
    senderIds,
    pushName: event.pushName ?? "",
    message,
    text: message.text,
    command: command?.name ?? "",
    args: command?.args ?? "",

    async reply(text, options = {}) {
      await send(chat, { type: "text", text }, { quote: event, mentions: options.mentions });
    },

    async replyOk(text, options) {
      const body = text ?? t("DONE");
      await ctx.reply(body.startsWith("✓") ? body : `✓ ${body}`, options);
    },

    async replyFail(text, options) {
      const body = text ?? t("FAILED");
      await ctx.reply(/^(✕|!)/.test(body) ? body : `✕ ${body}`, options);
    },

    async send(content, options = {}) {
      await send(chat, content, { quote: event, ...options });
    },

    async react(emoji) {
      try {
        await send(chat, { type: "reaction", emoji, target: event });
      } catch {
      }
    },

    async withTyping(work) {
      const setState = (state: "composing" | "paused") =>
        client.presence.sendChatstate(chat, { state }).catch(() => {});

      await setState("composing");
      try {
        return await work();
      } finally {
        await setState("paused");
      }
    },

    async downloadMedia() {
      const quoted = message.quoted;
      if (quoted && MEDIA_TYPES.includes(quoted.type)) {
        const bytes = await client.message.downloadBytes(quoted.content);
        return { bytes, type: quoted.type, mimetype: mimetypeOf(quoted.content) };
      }
      if (MEDIA_TYPES.includes(message.type)) {
        const bytes = await client.message.downloadBytes(event);
        return { bytes, type: message.type, mimetype: mimetypeOf(message.content) };
      }
      return null;
    },

    target() {
      return message.mentions[0] ?? (message.quoted?.sender || null);
    },

    group() {
      return getGroup(chat);
    },
  };

  return ctx;
}

function mimetypeOf(content: ParsedMessage["content"]): string {
  return (
    content.imageMessage?.mimetype ??
    content.videoMessage?.mimetype ??
    content.audioMessage?.mimetype ??
    content.stickerMessage?.mimetype ??
    content.documentMessage?.mimetype ??
    ""
  );
}
