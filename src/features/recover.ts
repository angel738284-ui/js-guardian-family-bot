import { proto, type WaIncomingProtocolMessageEvent } from "zapo-js";
import { send, sendText, wasSentByBot } from "../bot/client.ts";
import { extractText, unwrap } from "../core/message.ts";
import { mentionTag } from "../lib/jid.ts";
import { errorMessage, logger } from "../lib/logger.ts";
import { getAutoSettings, selfChat, type RecoverMode } from "./automation.ts";
import { cacheMessage, getCachedMessage } from "./messageCache.ts";

const ProtocolType = proto.Message.ProtocolMessage.Type;

function destination(mode: RecoverMode, chat: string): string | null {
  if (mode === "chat") return chat;
  if (mode === "owner") return selfChat();
  return null;
}

// Shows deleted messages again and the before/after of edits, as set with #antidelete and #antiedit.
export async function handleProtocolMessage(event: WaIncomingProtocolMessageEvent): Promise<void> {
  const protocol = event.protocolMessage;
  const chat = event.key.remoteJid;
  const id = protocol.key?.id;
  if (!id || event.key.fromMe) return;

  const original = getCachedMessage(chat, id);
  if (!original || wasSentByBot(id)) return;
  const settings = await getAutoSettings();
  const author = mentionTag(original.sender);

  try {
    if (protocol.type === ProtocolType.REVOKE) {
      const to = destination(settings.antidelete, chat);
      if (!to) return;
      await sendText(to, `*Deleted message* from ${author}`, [original.sender]);
      await send(to, original.content);
      return;
    }

    if (protocol.type === ProtocolType.MESSAGE_EDIT && protocol.editedMessage) {
      const edited = unwrap(protocol.editedMessage);
      cacheMessage({ ...original, content: edited });
      const to = destination(settings.antiedit, chat);
      if (!to) return;
      const before = extractText(original.content) || "(media)";
      const after = extractText(edited) || "(media)";
      await sendText(to, `*Edited message* from ${author}\n\n*Before:* ${before}\n*After:* ${after}`, [original.sender]);
    }
  } catch (error) {
    logger.warn(`Could not show a ${protocol.type === ProtocolType.REVOKE ? "deleted" : "edited"} message: ${errorMessage(error)}`);
  }
}
