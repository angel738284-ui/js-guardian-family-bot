import type { Ctx } from "../core/context.ts";
import { isJSLeader } from "./ai/leaderIdentity.ts";

const groupUses = new Map<string, {last:number; count:number; hour:number}>();
const userUses = new Map<string, number>();

export function isTargetedJSInsult(message: string): boolean {
  if (!message || message.length > 320 || /^\s*[#/.]/.test(message)) return false;
  if (/https?:\/\/|www\./i.test(message)) return false;
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (/\b(?:js|jota ese|el lider)\b.{0,18}\bno es (?:un |tan )?(?:manco|malo|noob|paquete)\b/.test(text)) return false;
  const target = "\\b(?:js|jota ese|el lider)\\b";
  const criticism = "\\b(?:manco|malisimo|horrible|pesimo|noob|paquete|boludo|inutil|pete|juega mal|no sabe jugar|no pega una|es re malo)\\b";
  return new RegExp(target + ".{0,45}" + criticism + "|" + criticism + ".{0,35}" + target).test(text);
}

const replies = [
  "A ver, corazón, acá a JS se lo respeta. Si tenés ganas de gastar energía, andá a practicar la puntería. 🧹",
  "Ay, mi cielo, ¿viniste a jugar Free Fire o a dar un discurso? Las bromas a JS se hacen con cariño. 😏",
  "La doña del grupo avisa: a JS me lo cuidás. Si vas a tirar una cargada, que por lo menos tenga gracia. 💅",
];

export function jsDefenseReply(ctx: Pick<Ctx, "isGroup"|"fromMe"|"senderIds"|"chat"|"text">, now=Date.now()): string | null {
  if (!ctx.isGroup || ctx.fromMe || isJSLeader(ctx) || !isTargetedJSInsult(ctx.text)) return null;
  const sender = ctx.chat + "|" + (ctx.senderIds[0] ?? "");
  if (now - (userUses.get(sender) ?? 0) < 40 * 60_000) return null;
  const old = groupUses.get(ctx.chat);
  const state = old && now - old.hour < 60 * 60_000 ? old : {last:0,count:0,hour:now};
  if (state.count >= 3 || now - state.last < 12 * 60_000) return null;
  state.count++;
  state.last = now;
  groupUses.set(ctx.chat,state);
  userUses.set(sender,now);
  if (groupUses.size > 200) groupUses.delete(groupUses.keys().next().value!);
  if (userUses.size > 500) userUses.delete(userUses.keys().next().value!);
  return replies[(state.count - 1) % replies.length]!;
}
