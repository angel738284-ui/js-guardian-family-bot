import type { Ctx } from "../../core/context.ts";
import { userPart } from "../../lib/jid.ts";

const TAG = /@\+?(\d{6,20})\b/g;

/** Every JID this message knows about: sender, mentions, quoted author and group members. */
async function knownJids(ctx: Ctx): Promise<string[]> {
  const key = ctx.event.key;
  const jids = [ctx.sender, key.participant, key.participantAlt, key.remoteJidAlt, ctx.message.quoted?.sender, ...ctx.message.mentions];
  if (!ctx.isGroup) jids.push(key.remoteJid);
  else {
    const group = await ctx.group().catch(() => null);
    for (const p of group?.participants ?? []) jids.push(p.jid, p.lid, p.phoneNumber);
  }
  return jids.filter((jid): jid is string => Boolean(jid?.includes("@")));
}

/** Turns `@handle` tags (phone number or LID) into the JIDs WhatsApp needs to highlight them. */
export async function resolveHandles(ctx: Ctx, handles: string[]): Promise<string[]> {
  if (handles.length === 0) return [];
  const byHandle = new Map<string, string>();
  for (const jid of await knownJids(ctx)) {
    const handle = userPart(jid);
    if (!byHandle.has(handle) || jid.endsWith("@s.whatsapp.net")) byHandle.set(handle, jid.replace(/:\d+@/, "@"));
  }
  const digits = handles.map((value) => value.replace(/\D/g, "")).filter((value) => value.length >= 6);
  return [...new Set(digits.map((value) => byHandle.get(value) ?? `${value}@s.whatsapp.net`))];
}

/** Fixes `@+123` to `@123` and returns the text with the JIDs it tags. */
export async function prepareMentions(ctx: Ctx, text: string): Promise<{ text: string; mentions: string[] }> {
  const clean = text.replace(/@\+(\d)/g, "@$1");
  if (!ctx.isGroup) return { text: clean, mentions: [] };
  const handles = [...clean.matchAll(TAG)].map((match) => match[1]!);
  return { text: clean, mentions: await resolveHandles(ctx, handles) };
}

export function handlesIn(text: string): string[] {
  return [...text.matchAll(TAG)].map((match) => match[1]!);
}
