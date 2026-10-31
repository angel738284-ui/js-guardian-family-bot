import type { Ctx } from "../core/context.ts";
import { isOwner } from "./access.ts";
import { isJSLeader } from "./ai/leaderIdentity.ts";
import { kv } from "../db/kv.ts";
import { sendText } from "../bot/client.ts";
import { kieConfigured, kieGenerate } from "./ai/kie.ts";
import { activateTeamSignup } from "./teamSignup.ts";

const DEST="js_director_destination_v1";
const DRAFT="js_director_draft_v1";
type Draft={text:string;group:string;created:number;request:string};
const leader=(ctx:Ctx)=>!ctx.fromMe&&(isOwner(ctx)||isJSLeader(ctx));
const normalized=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const confirm=/^(?:si[,! ]*)?(?:publicalo|publica|mandalo|envialo|enviar|confirmo|confirmar|dale[,! ]*mandalo)\s*[.!]*$/i;
const cancel=/^(?:cancelar|cancela|no lo mandes|descartar|olvidalo)\s*[.!]*$/i;
const requests=/(?:crea|creame|arm[aá]|armame|prepar[aá]|preparame|hac[eé]|haceme|haz|redact[aá]|redactame|organiza|organizame|publica|manda|envia|anuncia)/;
const topics=/(?:torneo|6\s*(?:vs|v|contra|x)\s*6|enfrentamiento|equipo|lista|anuncio|aviso|comunicado|mensaje)/;

export async function privateDirector(ctx:Ctx):Promise<boolean>{
 if(!leader(ctx))return false;
 const raw=ctx.text.trim(), text=normalized(raw);
 if(ctx.isGroup){
  if(!/^\.destino(?:\s|$)/i.test(raw))return false;
  const args=raw.split(/\s+/).slice(1).join(" ").toLowerCase();
  if(args==="poner"||args==="activar"||args==="este"){
   await kv.set(DEST,{jid:ctx.chat,name:(await ctx.group()).subject});
   await ctx.reply("✅ Este grupo quedó seleccionado como destino de los anuncios que me pidas por privado. Para cambiarlo, usá *.destino poner* en otro grupo.");
  }else if(args==="ver"){
   const current=await kv.get<{jid:string;name:string}>(DEST);
   await ctx.reply(current?.jid===ctx.chat?"📍 Este es el grupo de destino.":"📍 Este grupo no está seleccionado.");
  }else await ctx.reply("Para autorizar este grupo como destino, escribí *.destino poner* acá.");
  return true;
 }
 if(/^\.destino(?:\s|$)/i.test(raw)){
  const target=await kv.get<{jid:string;name:string}>(DEST);
  await ctx.reply(target?"📍 Grupo de destino: *"+target.name+"*":"⚠️ Todavía no elegiste grupo. Escribí *.destino poner* dentro del grupo donde querés publicar.");
  return true;
 }
 const pending=await kv.get<Draft>(DRAFT);
 if(cancel.test(text)&&pending){
  await kv.set(DRAFT,null);
  await ctx.reply("❌ Borré el borrador. No envié nada al grupo.");
  return true;
 }
 if(confirm.test(text)&&pending){
  if(Date.now()-pending.created>30*60_000){
   await kv.set(DRAFT,null);await ctx.reply("⌛ El borrador venció. Pedime que lo prepare de nuevo.");return true;
  }
  const dest=await kv.get<{jid:string;name:string}>(DEST);
  if(!dest||dest.jid!==pending.group){await ctx.reply("⚠️ Cambió el grupo de destino. Volvé a preparar el anuncio para evitar enviarlo al grupo equivocado.");return true;}
  try{
   await sendText(dest.jid,pending.text);
   if(/6\s*(?:vs|v|x|contra)\s*6/i.test(pending.request)){
    const colors=["negro","rojo","blanco","azul"].filter(c=>new RegExp("\b"+c+"\b","i").test(pending.request));
    if(colors.length===2){
     await activateTeamSignup(dest.jid,colors);
     await sendText(dest.jid,"📋 *INSCRIPCIONES AUTOMÁTICAS ABIERTAS*\nMandá únicamente tu *ID de Free Fire y color*.\nEjemplo: *123456789 negro*\nVerificaré el nombre del ID y lo agregaré al equipo elegido.\nUsá *.equipos lista* para ver los cupos.");
    }
   }
   await kv.set(DRAFT,null);
   await ctx.reply("✅ Publicado en *"+dest.name+"*.");
  }catch{await ctx.reply("⚠️ No pude publicar el anuncio. Revisá que el bot siga en el grupo y probá otra vez.");}
  return true;
 }
 if(!requests.test(text)||!topics.test(text))return false;
 const target=await kv.get<{jid:string;name:string}>(DEST);
 if(!target){await ctx.reply("📍 Primero elegí el grupo donde querés publicar: entrá a ese grupo y mandá *.destino poner*. Después volvé acá y pedime el anuncio.");return true;}
 if(!kieConfigured()){await ctx.reply("⚠️ Para redactar anuncios con IA necesito que Kie esté configurado.");return true;}
 await ctx.reply("📝 Voy a preparar el borrador. No publicaré nada sin tu confirmación.");
 try{
  const draft=await kieGenerate(
   "Redactá SOLO un mensaje de WhatsApp listo para publicar en un grupo de Free Fire. Pedido del dueño: "+raw+
   "\nReglas: español argentino, claro, ordenado, con emojis moderados y títulos con *asteriscos* de WhatsApp. Si pide un torneo 6 vs 6, hacé dos listas de seis lugares numerados por equipo; no inventes jugadores, fecha, premio, reglas ni datos no proporcionados. Si pide Negro vs Rojo, respetá esos nombres. No digas que creaste un torneo real ni que ya se publicó. No incluyas explicaciones fuera del anuncio.",
   "JS",2,[],[],true
  );
  await kv.set(DRAFT,{text:draft,group:target.jid,created:Date.now(),request:raw} satisfies Draft);
  await ctx.reply("📋 *VISTA PREVIA*\n📍 Destino: *"+target.name+"*\n\n"+draft+"\n\n────────────\nRespondé *publicalo* para enviarlo, o *cancelar* para descartarlo. El borrador vence en 30 minutos.");
 }catch{await ctx.reply("⚠️ No pude preparar el anuncio con IA. Probá otra vez en unos segundos.");}
 return true;
}
