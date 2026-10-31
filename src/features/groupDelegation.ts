import type { Ctx } from "../core/context.ts";
import { kv } from "../db/kv.ts";
import { isOwner } from "./access.ts";
import { isJSLeader } from "./ai/leaderIdentity.ts";

type Grants = Record<string, string[]>;
const KEY="js_group_toggle_delegations_v1";
const phone=(v:string)=>v.replace(/\D/g,"");
const valid=(v:string)=>/^\d{8,15}$/.test(v);
async function get():Promise<Grants>{return await kv.get<Grants>(KEY) ?? {};}
export async function canToggleGroup(ctx:Ctx):Promise<boolean>{
 const entries=(await get())[ctx.chat]??[];
 // Never match a WhatsApp LID to a phone number by guessing.
 return ctx.senderIds.some(id=>id.endsWith("@s.whatsapp.net")&&entries.includes(phone(id)));
}
export async function handleGroupPermission(ctx:Ctx):Promise<boolean>{
 if(!ctx.isGroup || !/^[.\/]permiso(?:\s|$)/i.test(ctx.text.trim()))return false;
 if(!isOwner(ctx)&&!isJSLeader(ctx)){await ctx.reply("⛔ Solo el dueño puede administrar permisos.");return true;}
 const args=ctx.text.trim().split(/\s+/);
 const action=(args[1]??"").toLowerCase();
 if(!["agregar","quitar","lista","ver"].includes(action)){await ctx.reply("Uso: /permiso agregar NÚMERO grupo | /permiso quitar NÚMERO grupo | /permiso ver NÚMERO | /permiso lista");return true;}
 const grants=await get(), list=grants[ctx.chat]??[];
 if(action==="lista"){await ctx.reply(list.length?"🔐 Autorizados a usar .on y .off en este grupo:\n"+list.map((n,i)=>`${i+1}. ${n}`).join("\n"):"🔐 No hay números delegados en este grupo.");return true;}
 const number=phone(args[2]??"");
 if(!valid(number)){await ctx.reply("⚠️ Indicá un número internacional válido, por ejemplo 5491123456789.");return true;}
 if(action==="ver"){await ctx.reply(list.includes(number)?"✅ "+number+" puede usar .on y .off en este grupo.":"❌ "+number+" no tiene permiso en este grupo.");return true;}
 if((args[3]??"").toLowerCase()!=="grupo"){await ctx.reply("⚠️ Especificá el alcance «grupo», por ejemplo /permiso agregar 5491123456789 grupo.");return true;}
 if(action==="agregar"){
  if(list.includes(number)){await ctx.reply("ℹ️ Ese número ya está autorizado en este grupo.");return true;}
  grants[ctx.chat]=[...list,number];
 }else{
  if(!list.includes(number)){await ctx.reply("ℹ️ Ese número no tiene permiso en este grupo.");return true;}
  grants[ctx.chat]=list.filter(n=>n!==number);
 }
 await kv.set(KEY,grants);
 await ctx.reply(action==="agregar"?"✅ "+number+" ahora puede usar solamente .on y .off en este grupo.":"✅ Permiso de .on y .off revocado para "+number+".");
 return true;
}
