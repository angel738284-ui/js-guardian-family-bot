import type { Ctx } from "../core/context.ts";
import { kv } from "../db/kv.ts";
import { sendText } from "../bot/client.ts";
import { isOwner } from "./access.ts";
import { isJSLeader } from "./ai/leaderIdentity.ts";
import { epinLatamProducts, epinValidate, hasEpinbyKey } from "./epinbyApi.ts";

type Player={id:string;name:string;sender:string};
type Purga={active:boolean;time:string;date:string;players:Player[];created:number};
type Preview={group:string;time:string;date:string;created:number};
const destKey="js_director_destination_v1";
const previewKey="js_purga_preview_v1";
const key=(group:string)=>"js_purga:"+group;
const busy=new Set<string>();
const owner=(ctx:Ctx)=>isOwner(ctx)||isJSLeader(ctx);
const dateAR=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const announcement=(time:string)=>"🔥 *LA PURGA DE JS FAMILY* 🔥\n\n🕗 *Hoy a las "+time+" hs (Argentina)*\n🎮 *Free Fire — La Purga*\n\n📋 *INSCRIPCIONES*\nMandá *solamente tu ID de Free Fire* en este grupo. JS Guardian verificará tu nombre y te anotará automáticamente en la lista.\n\n⚔️ *REGLAS*\n• Nadie puede matar: *solo el líder JS puede eliminar*.\n• Prohibido hacer daño de cualquier clase.\n• Prohibido usar emotes: quien use uno queda eliminado.\n• No se permite caer en lugares altos, inaccesibles o esconderse en zonas imposibles de alcanzar.\n• Prohibido usar vehículos.\n• Respeten las indicaciones del líder JS.\n\n🏆 *GANADOR:* la última persona que permanezca viva en la sala.\n\n📌 Las inscripciones quedan abiertas hasta que JS cierre la lista.";
const listing=(s:Purga)=>"🔥 *PARTICIPANTES DE LA PURGA*\n🕗 "+s.time+" hs (Argentina)\n"+(s.active?"🟢 Inscripciones abiertas":"🔒 Inscripciones cerradas")+"\n👥 *Total: "+s.players.length+"*\n\n"+(s.players.length?s.players.map((p,i)=>(i+1)+". *"+p.name.replace(/[\r\n*]/g," ").slice(0,65)+"* — "+p.id).join("\n"):"Todavía no hay anotados.");
export async function purga(ctx:Ctx):Promise<boolean>{
 const text=ctx.text.trim();
 const cmd=text.match(/^\.purga(?:\s+(.*))?$/i);
 if(!ctx.isGroup&&owner(ctx)){
  const preview=await kv.get<Preview>(previewKey);
  if(cmd){
   const arg=(cmd[1]??"").trim().toLowerCase();
   if(/^([01]?\d|2[0-3]):[0-5]\d$/.test(arg)){
    const dest=await kv.get<{jid:string;name:string}>(destKey);
    if(!dest){await ctx.reply("📍 Primero configurá el grupo con *.destino poner* dentro de él.");return true;}
    const existing=await kv.get<Purga>(key(dest.jid));
    if(existing?.active&&existing.players.length){await ctx.reply("⚠️ Ya hay una Purga con "+existing.players.length+" participantes. Cerrala con *.purga cerrar* antes de crear otra; no voy a borrar la lista sin avisarte.");return true;}
    const [h,m]=arg.split(":");
    const time=h!.padStart(2,"0")+":"+m;
    await kv.set(previewKey,{group:dest.jid,time,date:dateAR(),created:Date.now()} satisfies Preview);
    await ctx.reply("📋 *VISTA PREVIA — NO PUBLICADA*\n📍 Destino: *"+dest.name+"*\n\n"+announcement(time)+"\n\n────────────\nRespondé *.purga publicar* para enviar al grupo y abrir inscripciones, o *.purga cancelar* para descartar. La vista previa vence en 30 minutos.");
    return true;
   }
   if(arg==="cancelar"){await kv.delete(previewKey);await ctx.reply("❌ Vista previa descartada. No publiqué nada.");return true;}
   if(arg==="publicar"){
    if(!preview||Date.now()-preview.created>30*60_000){await kv.delete(previewKey);await ctx.reply("⌛ La vista previa venció. Prepará otra con *.purga 20:30*.");return true;}
    const dest=await kv.get<{jid:string;name:string}>(destKey);
    if(!dest||dest.jid!==preview.group){await ctx.reply("⚠️ Cambió el grupo de destino. No publiqué nada.");return true;}
    const current=await kv.get<Purga>(key(dest.jid));
    if(current?.active&&current.players.length){await ctx.reply("⚠️ Ya hay inscripciones activas. Cerrá esa lista antes de publicar otra.");return true;}
    try{
     await sendText(dest.jid,announcement(preview.time));
     await kv.set(key(dest.jid),{active:true,time:preview.time,date:preview.date,players:[],created:Date.now()} satisfies Purga);
     await kv.delete(previewKey);
     await ctx.reply("✅ *LA PURGA PUBLICADA* en "+dest.name+". Ya estoy tomando IDs. Consultá *.purga lista*.");
    }catch{await ctx.reply("⚠️ No pude completar la publicación. Revisá el grupo antes de reintentar para evitar anuncios duplicados.");}
    return true;
   }
   if(arg==="lista"||arg==="estado"){
    const dest=await kv.get<{jid:string;name:string}>(destKey);
    const s=dest?await kv.get<Purga>(key(dest.jid)):null;
    await ctx.reply(s?listing(s):"📋 Todavía no hay una Purga configurada en el grupo de destino.");return true;
   }
   if(arg==="cerrar"){
    const dest=await kv.get<{jid:string;name:string}>(destKey);
    const s=dest?await kv.get<Purga>(key(dest.jid)):null;
    if(!s||!dest){await ctx.reply("No hay una Purga activa.");return true;}
    s.active=false;await kv.set(key(dest.jid),s);
    await ctx.reply("🔒 Inscripciones de La Purga cerradas.\n\n"+listing(s));
    await sendText(dest.jid,"🔒 *INSCRIPCIONES DE LA PURGA CERRADAS*\n\n"+listing(s));
    return true;
   }
   await ctx.reply("🔥 *LA PURGA*\n*.purga 20:30* — Preparar anuncio\n*.purga publicar* — Publicar y abrir lista\n*.purga lista* — Ver anotados\n*.purga cerrar* — Cerrar lista\n*.purga cancelar* — Descartar vista previa");
   return true;
  }
  if(preview&&/^(?:publicalo|publica|mandalo|envialo)$/i.test(text)){
   await ctx.reply("Para confirmar el anuncio de La Purga, escribí *.purga publicar*.");return true;
  }
 }
 if(!ctx.isGroup)return false;
 if(cmd){
  const arg=(cmd[1]??"").trim().toLowerCase();
  if(arg==="lista"||arg==="estado"){
   const s=await kv.get<Purga>(key(ctx.chat));
   await ctx.reply(s?listing(s):"📋 No hay una Purga configurada en este grupo.");return true;
  }
  if(arg==="cerrar"){
   if(!owner(ctx)){await ctx.reply("⛔ Solo JS puede cerrar la lista.");return true;}
   const s=await kv.get<Purga>(key(ctx.chat));
   if(!s){await ctx.reply("No hay una Purga configurada.");return true;}
   s.active=false;await kv.set(key(ctx.chat),s);await ctx.reply("🔒 Inscripciones cerradas.\n\n"+listing(s));return true;
  }
  return false;
 }
 if(!/^\d{5,16}$/.test(text))return false;
 const s=await kv.get<Purga>(key(ctx.chat));
 if(!s?.active)return false;
 if(busy.has(ctx.chat)){await ctx.reply("⏳ Estoy verificando otro ID. Intentá nuevamente en unos segundos.");return true;}
 busy.add(ctx.chat);
 try{
  const fresh=await kv.get<Purga>(key(ctx.chat));
  if(!fresh?.active){await ctx.reply("🔒 Las inscripciones ya están cerradas.");return true;}
  if(fresh.players.some(p=>p.id===text||p.sender===ctx.sender)){await ctx.reply("⚠️ Ese ID o número de WhatsApp ya está anotado en La Purga.");return true;}
  if(!hasEpinbyKey())throw new Error("La verificación de Epinby no está disponible.");
  const products=await epinLatamProducts();
  const product=products.find(p=>p.supports_player_validation===true);
  if(!product)throw new Error("No hay un producto habilitado para verificar IDs.");
  const player=await epinValidate(product.id,text);
  const name=(player.nickname??player.player_name??"").trim();
  if(player.nickname_verified!==true||!name)throw new Error("No se pudo verificar el nombre de ese ID.");
  const region=String(player.region??"").toUpperCase();
  if(region&&!["SAC","LATAM","LA","SA","AR","ARGENTINA","SOUTH AMERICA"].includes(region))throw new Error("Ese ID pertenece a otra región.");
  fresh.players.push({id:text,name:name.slice(0,65),sender:ctx.sender});
  await kv.set(key(ctx.chat),fresh);
  await ctx.reply("✅ *ANOTADO EN LA PURGA*\n"+fresh.players.length+". *"+name.replace(/[\r\n*]/g," ")+"* — "+text+"\n\n"+listing(fresh));
 }catch(e){await ctx.reply("⚠️ No pude verificar tu ID: "+(e instanceof Error?e.message:"Error temporal")+". No quedaste anotado.");}
 finally{busy.delete(ctx.chat);}
 return true;
}
