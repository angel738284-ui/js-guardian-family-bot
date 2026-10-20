import type { Ctx } from "../core/context.ts";
import { send, sendText } from "../bot/client.ts";
import { isPrivileged } from "./access.ts";
import { getGroupSettings } from "./groupSettings.ts";
import { getGroup, isBotAdmin, isGroupAdmin } from "./groups.ts";
import { t } from "./i18n.ts";

const LINK_PATTERN = /(?:https?:\/\/|www\.|wa\.me\/|chat\.whatsapp\.com\/|t\.me\/)\S+/i;

export function containsLink(text: string): boolean {
  return LINK_PATTERN.test(text);
}

const recentMessages = new Map<string, number[]>();
const lastSpamWarning = new Map<string, number>();

function isSpamming(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (recentMessages.get(key) ?? []).filter((time) => now - time < windowMs);
  recent.push(now);
  recentMessages.set(key, recent);
  return recent.length > limit;
}

async function deleteMessage(ctx: Ctx): Promise<void> {
  await send(ctx.chat, { type: "revoke", target: ctx.event }).catch(() => {});
}

export async function runGroupGuards(ctx: Ctx): Promise<boolean> {
  if (!ctx.isGroup || ctx.fromMe) return false;

  const settings = await getGroupSettings(ctx.chat);
  const anyGuardOn = settings.muted.length > 0 || settings.antispam || settings.antilink;
  if (!anyGuardOn) return false;

  const group = await getGroup(ctx.chat).catch(() => null);
  const botCanDelete = group ? isBotAdmin(group) : false;

  // Mute applies to admins too.
  if (settings.muted.some((id) => ctx.senderIds.includes(id))) {
    if (botCanDelete) await deleteMessage(ctx);
    return true;
  }

  const exempt = (group && isGroupAdmin(group, ctx.senderIds)) || (await isPrivileged(ctx));
  if (exempt) return false;

  if (settings.antispam) {
    const key = `${ctx.chat}:${ctx.senderIds[0]}`;
    if (isSpamming(key, settings.antispamLimit, settings.antispamWindowMs)) {
      if (botCanDelete) await deleteMessage(ctx);
      const lastWarning = lastSpamWarning.get(key) ?? 0;
      if (Date.now() - lastWarning > settings.antispamWindowMs) {
        lastSpamWarning.set(key, Date.now());
        await sendText(ctx.chat, t("ANTISPAM")).catch(() => {});
      }
      return true;
    }
  }

  if (settings.antilink && containsLink(ctx.text)) {
    if (botCanDelete) await deleteMessage(ctx);
    await sendText(ctx.chat, t("ANTILINK")).catch(() => {});
    return true;
  }

  return false;
}
