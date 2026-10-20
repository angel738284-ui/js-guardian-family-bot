import type { Proto } from "zapo-js";

export type MessageType = "text" | "image" | "video" | "audio" | "sticker" | "document" | "other";

export const MEDIA_TYPES: readonly MessageType[] = ["image", "video", "audio", "sticker", "document"];

export interface QuotedMessage {
  id: string;
  sender: string;
  type: MessageType;
  text: string;
  content: Proto.IMessage;
}

export interface ParsedMessage {
  type: MessageType;
  text: string;
  mentions: string[];
  quoted: QuotedMessage | null;
  content: Proto.IMessage;
}

const WRAPPERS = [
  "ephemeralMessage",
  "viewOnceMessage",
  "viewOnceMessageV2",
  "viewOnceMessageV2Extension",
  "documentWithCaptionMessage",
  "editedMessage",
] as const;

export function unwrap(message: Proto.IMessage): Proto.IMessage {
  let current = message;
  for (let depth = 0; depth < 5; depth++) {
    const wrapper = WRAPPERS.map((name) => current[name]).find((value) => value?.message);
    if (!wrapper?.message) break;
    current = wrapper.message;
  }
  return current;
}

export function detectType(content: Proto.IMessage): MessageType {
  if (content.conversation || content.extendedTextMessage) return "text";
  if (content.imageMessage) return "image";
  if (content.videoMessage || content.ptvMessage) return "video";
  if (content.audioMessage) return "audio";
  if (content.stickerMessage) return "sticker";
  if (content.documentMessage) return "document";
  return "other";
}

export function extractText(content: Proto.IMessage): string {
  return (
    content.conversation ??
    content.extendedTextMessage?.text ??
    content.imageMessage?.caption ??
    content.videoMessage?.caption ??
    content.documentMessage?.caption ??
    ""
  );
}

function findContextInfo(content: Proto.IMessage): Proto.IContextInfo | null {
  return (
    content.extendedTextMessage?.contextInfo ??
    content.imageMessage?.contextInfo ??
    content.videoMessage?.contextInfo ??
    content.audioMessage?.contextInfo ??
    content.stickerMessage?.contextInfo ??
    content.documentMessage?.contextInfo ??
    content.ptvMessage?.contextInfo ??
    null
  );
}

export function parseMessage(raw: Proto.IMessage | null | undefined): ParsedMessage | null {
  if (!raw) return null;

  const content = unwrap(raw);
  const type = detectType(content);
  if (type === "other") return null;

  const contextInfo = findContextInfo(content);
  const mentions = (contextInfo?.mentionedJid ?? []).filter((jid): jid is string => Boolean(jid));

  let quoted: QuotedMessage | null = null;
  if (contextInfo?.quotedMessage) {
    const quotedContent = unwrap(contextInfo.quotedMessage);
    quoted = {
      id: contextInfo.stanzaId ?? "",
      sender: contextInfo.participant ?? "",
      type: detectType(quotedContent),
      text: extractText(quotedContent),
      content: quotedContent,
    };
  }

  return { type, text: extractText(content), mentions, quoted, content };
}
