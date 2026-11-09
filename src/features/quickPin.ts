import type { Ctx } from "../core/context.ts";
import { send } from "../bot/client.ts";
import { isBanned, isOwner } from "./access.ts";
import { isJSLeader } from "./ai/leaderIdentity.ts";
import { isBotAdmin, isGroupAdmin } from "./groups.ts";
import { quotedKey } from "../lib/ctx.ts";
import { quickPinPayload } from "./quickPinMessage.ts";

/** .f fija el mensaje al que se responde. No fija el chat ni cambia otros permisos. */
export async function handleQuickPin(ctx:Ctx):Promise<boolean> {
  if (ctx.command !== "f") return false;
  if (!ctx.isGroup) {
    await ctx.replyFail("Usá *.f* respondiendo a un mensaje dentro del grupo.");
    return true;
  }
  if (ctx.args.trim()) {
    await ctx.replyFail("Solo respondé a un mensaje y escribí *.f* (sin argumentos).");
    return true;
  }
  const target=quotedKey(ctx);
  if (!target) {
    await ctx.replyFail("Respondé al mensaje que querés fijar y escribí *.f*.");
    return true;
  }
  try {
    const group=await ctx.group();
    if (!(isOwner(ctx)||isJSLeader(ctx)||isGroupAdmin(group,ctx.senderIds))) {
      await ctx.replyFail("Solo JS o los administradores pueden fijar mensajes.");
      return true;
    }
    if (!ctx.fromMe && await isBanned(ctx)) return true;
    if (!isBotAdmin(group)) {
      await ctx.replyFail("Necesito ser administrador del grupo para fijar mensajes.");
      return true;
    }
    await send(ctx.chat, quickPinPayload(target));
    await ctx.react("📌");
  } catch {
    await ctx.replyFail("No pude fijar ese mensaje. Revisá que siga disponible y que tenga permisos para fijarlo.");
  }
  return true;
}
