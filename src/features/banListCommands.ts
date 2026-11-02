import type { Ctx } from "../core/context.ts";
import { kv } from "../db/kv.ts";
import { isOwner } from "./access.ts";
import { isJSLeader } from "./ai/leaderIdentity.ts";
import { listGuardianStateScope, setBannedAliases } from "./jsGuardianStore.ts";

const pendingKey=(group:string)=>"js:guardian:clearbans:"+group;
type Pending={created:number;aliases:string[][];owner:string};
function uniqueBans(rows:Awaited<ReturnType<typeof listGuardianStateScope>>):string[][]{
 const groups=new Map<string,string[]>();
 for(const row of rows){
  const aliases=Array.isArray(row.value.aliases)?row.value.aliases.filter((v):v is string=>typeof v==="string"):[row.item];
  const ids=[...new Set([row.item,...aliases])].sort();
  const key=ids.join("|");
  if(!groups.has(key))groups.set(key,ids);
 }
 return [...groups.values()];
}
export async function banListCommands(ctx:Ctx):Promise<boolean>{
 const raw=ctx.text.trim();
 if(!/^\.(?:baneados|eliminarbans)(?:\s+(?:confirmar|cancelar))?$/i.test(raw))return false;
 if(!ctx.isGroup){await ctx.reply("Usá este comando dentro del grupo del que querés administrar los baneos.");return true;}
 if(ctx.fromMe||!(isOwner(ctx)||isJSLeader(ctx))){await ctx.reply("Solo el dueño verificado puede administrar los baneos de Guardian.");return true;}
 const rows=await listGuardianStateScope(`ban:${ctx.chat}`);
 const bans=uniqueBans(rows);
 if(/^\.baneados$/i.test(raw)){
  const lines=bans.map((ids,i)=>`${i+1}. ${ids.join(" / ")}`);
  await ctx.reply(`🔒 *BANEADOS POR JS GUARDIAN*\n${bans.length} usuario(s) bloqueado(s) en este grupo.\n\n${lines.join("\n").slice(0,3200)||"No hay usuarios baneados."}\n\nPara quitar uno: *.desbanjs @usuario* o *.desbanjs lista*.`);
  return true;
 }
 if(/^\.eliminarbans cancelar$/i.test(raw)){
  await kv.delete(pendingKey(ctx.chat));await ctx.reply("Cancelado. No se eliminó ningún ban.");return true;
 }
 if(/^\.eliminarbans confirmar$/i.test(raw)){
  const p=await kv.get<Pending>(pendingKey(ctx.chat));
  if(!p||Date.now()-p.created>5*60_000||p.owner!==ctx.sender){await ctx.reply("La confirmación venció o no corresponde a tu sesión. Volvé a escribir *.eliminarbans*.");return true;}
  // Only remove bans that existed at preview time. New bans remain untouched.
  let count=0;
  for(const aliases of p.aliases){await setBannedAliases(ctx.chat,aliases,false);count++;}
  await kv.delete(pendingKey(ctx.chat));
  await ctx.reply(`🔓 Eliminé ${count} bloqueo(s) de la lista negra de Guardian de este grupo. No se desbloquearon contactos de WhatsApp ni se invitó a nadie automáticamente.`);
  return true;
 }
 if(!bans.length){await ctx.reply("No hay baneados de Guardian en este grupo.");return true;}
 await kv.set(pendingKey(ctx.chat),{created:Date.now(),aliases:bans,owner:ctx.sender} satisfies Pending);
 await ctx.reply(`⚠️ *ELIMINAR TODOS LOS BANS*\nSe quitarán ${bans.length} bloqueo(s) de Guardian en este grupo.\n\nRespondé *.eliminarbans confirmar* dentro de 5 minutos, o *.eliminarbans cancelar*.`);
 return true;
}
