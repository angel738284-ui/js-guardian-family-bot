import type { WaMessageKey } from "zapo-js";
import { botIdentity } from "../bot/client.ts";
import type { Ctx } from "../core/context.ts";
import { isPrivileged } from "../features/access.ts";
import type { Scope } from "../features/filters.ts";
import { isGroupAdmin } from "../features/groups.ts";
import { normalizeId, phoneToJid } from "./jid.ts";

export function isBotId(jid: string): boolean {
  const me = [botIdentity().jid, botIdentity().lid].filter(Boolean).map(normalizeId);
  return me.includes(normalizeId(jid));
}

export function quotedKey(ctx: Ctx): WaMessageKey | null {
  const quoted = ctx.message.quoted;
  if (!quoted?.id) return null;
  return {
    remoteJid: ctx.chat,
    id: quoted.id,
    fromMe: isBotId(quoted.sender),
    participant: ctx.isGroup ? quoted.sender : undefined,
  };
}

// Groups: admins manage the group's own replies. "global" and DMs need sudo.
export async function replyScope(ctx: Ctx, wantsGlobal: boolean): Promise<Scope | null> {
  const privileged = await isPrivileged(ctx);
  if (wantsGlobal || !ctx.isGroup) return privileged ? "global" : null;
  if (privileged || isGroupAdmin(await ctx.group(), ctx.senderIds)) return ctx.chat;
  return null;
}

// Who a command acts on: a mention or reply, else a number in the text, else the fallback.
export function personFor(ctx: Ctx, fallback: "sender" | "chat" | "none" = "none"): string | null {
  const target = ctx.target();
  if (target) return target;
  const digits = ctx.args.replace(/\D/g, "");
  if (digits.length >= 7) return phoneToJid(digits);
  if (fallback === "sender") return ctx.sender;
  if (fallback === "chat" && !ctx.isGroup) return ctx.chat;
  return null;
}

// Stable ID for per-person data (notes, budget, ...).
export function senderKey(ctx: Ctx): string {
  return ctx.senderIds[0] ?? ctx.sender;
}
