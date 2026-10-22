import type { WaGroupEvent } from "zapo-js";
import { getClient, send, sendText } from "../bot/client.ts";
import type { Ctx } from "../core/context.ts";
import { mentionTag, normalizeId } from "../lib/jid.ts";
import { errorMessage, logger } from "../lib/logger.ts";
import { getGroupSettings } from "./groupSettings.ts";
import { getGroup, isBotAdmin } from "./groups.ts";

const CAPTCHA_MS = 5 * 60_000;

interface PendingCaptcha {
  code: string;
  jid: string;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, PendingCaptcha>();
const captchaKey = (group: string, id: string) => `${group}|${normalizeId(id)}`;

function startCaptcha(group: string, jid: string): void {
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const key = captchaKey(group, jid);
  clearTimeout(pending.get(key)?.timer);

  const timer = setTimeout(async () => {
    pending.delete(key);
    try {
      const metadata = await getGroup(group);
      if (!isBotAdmin(metadata)) return;
      await getClient()?.group.removeParticipants(group, [jid]);
      await sendText(group, `_${mentionTag(jid)} did not verify in time and was removed._`, [jid]);
    } catch (error) {
      logger.warn(`Captcha removal failed in ${group}: ${errorMessage(error)}`);
    }
  }, CAPTCHA_MS);

  pending.set(key, { code, jid, timer });
  void sendText(group, `Welcome ${mentionTag(jid)}! Send *${code}* here within 5 minutes to show you are human, or you will be removed.`, [jid]);
}

// Blocks messages from members who still have to solve their captcha. Returns true when handled.
export async function checkCaptcha(ctx: Ctx): Promise<boolean> {
  if (!ctx.isGroup || pending.size === 0) return false;
  const entry = ctx.senderIds.map((id) => pending.get(captchaKey(ctx.chat, id))).find(Boolean);
  if (!entry) return false;

  if (ctx.text.includes(entry.code)) {
    clearTimeout(entry.timer);
    for (const id of ctx.senderIds) pending.delete(captchaKey(ctx.chat, id));
    await ctx.reply("✓ Verified. Welcome!");
    return true;
  }

  const group = await getGroup(ctx.chat).catch(() => null);
  if (group && isBotAdmin(group)) await send(ctx.chat, { type: "revoke", target: ctx.event }).catch(() => {});
  return true;
}

function describe(event: WaGroupEvent): string | null {
  const who = event.authorJid ? mentionTag(event.authorJid) : "Someone";
  const people = (event.participants ?? []).map((p) => (p.jid ? mentionTag(p.jid) : "someone")).join(", ");

  switch (event.action) {
    case "subject":
      return `${who} renamed the group to *${event.subject ?? ""}*`;
    case "description":
      return `${who} changed the group description`;
    case "announce":
    case "restrict":
      return `${who} changed the group settings`;
    case "promote":
      return `${who} made ${people} admin`;
    case "demote":
      return `${who} removed ${people} as admin`;
    case "revoke_invite":
      return `${who} reset the invite link`;
    case "ephemeral":
      return `${who} changed disappearing messages`;
    default:
      return null;
  }
}

export async function watchGroupEvent(event: WaGroupEvent): Promise<void> {
  const group = event.groupJid;
  if (!group) return;
  const settings = await getGroupSettings(group);

  if (settings.captcha && event.action === "add") {
    for (const participant of event.participants ?? []) {
      if (participant.jid) startCaptcha(group, participant.jid);
    }
  }

  if (settings.events) {
    const text = describe(event);
    if (!text) return;
    const mentions = [event.authorJid, ...(event.participants ?? []).map((p) => p.jid)].filter((jid): jid is string => Boolean(jid));
    await sendText(group, `_${text}_`, mentions).catch(() => {});
  }
}
