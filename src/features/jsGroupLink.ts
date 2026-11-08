/** JS Guardian: publicar el enlace actual del grupo como texto reenviable.
 * No crea grupos, no rota ni revoca códigos, no usa direcciones de otros grupos.
 */
import type { Ctx } from "../core/context.ts";
import { isOwner, isBanned } from "./access.ts";
import { isJSLeader } from "./ai/leaderIdentity.ts";
import { isBotAdmin, isGroupAdmin } from "./groups.ts";
import { buildGroupInviteMessage } from "./jsGroupLinkText.ts";

const cooldown = new Map<string, number>();
const COOLDOWN_MS = 20_000;



export async function handleGroupLink(ctx:Ctx):Promise<boolean>{
  if(ctx.command!=="link")return false;
  if(!ctx.isGroup){
    await ctx.reply("🔗 Usá *.link* dentro del grupo cuyo enlace querés compartir.");
    return true;
  }
  try {
    const group=await ctx.group();
    const authorized=isOwner(ctx)||isJSLeader(ctx)||isGroupAdmin(group,ctx.senderIds);
    if(!authorized){
      await ctx.reply("⛔ Solo JS y los administradores pueden publicar la invitación del grupo.");
      return true;
    }
    if(!ctx.fromMe && await isBanned(ctx))return true;
    if(!isBotAdmin(group)){
      await ctx.reply("⚠️ Para consultar el enlace de invitación necesito ser administrador de este grupo.");
      return true;
    }
    const last=cooldown.get(ctx.chat)??0;
    if(Date.now()-last<COOLDOWN_MS){
      await ctx.reply("🔗 Ya publiqué un enlace hace poco. Podés reenviar el mensaje anterior.");
      return true;
    }
    const code=await ctx.client.group.queryInviteCode(ctx.chat);
    // Solo se anuncia un enlace después de que WhatsApp confirma el código actual.
    const message=buildGroupInviteMessage(group.subject,code);
    await ctx.reply(message);
    cooldown.set(ctx.chat,Date.now());
    if(cooldown.size>250)cooldown.clear();
  } catch {
    await ctx.reply("⚠️ No pude consultar la invitación de este grupo. Revisá que el bot tenga permisos de administrador y que los enlaces estén habilitados.");
  }
  return true;
}
