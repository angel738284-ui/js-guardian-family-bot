import type { Ctx } from "../core/context.ts";
import { isOwner } from "./access.ts";
import { isJSLeader } from "./ai/leaderIdentity.ts";
import { kv } from "../db/kv.ts";
import { sendText } from "../bot/client.ts";
import { kieConfigured, kieGenerate } from "./ai/kie.ts";
import { activateTeamSignup, getTeamSignup, getTeamSignupStatus, startSubstituteSignup, getSubstituteStatus } from "./teamSignup.ts";

const DEST="js_director_destination_v1";
const DRAFT="js_director_draft_v1";
const RESET="js_director_signup_reset_v1";
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
 // Preguntas sobre la lista del torneo activo se contestan desde el estado persistente,
 // no desde la memoria temporal de la IA.
 if(/^(?:\.equipos\s+(?:lista|estado)|(?:che[, ]*)?(?:como|que|mostra|mostrame|pasame|dame|ver|quiero ver|cuantos|cuantas|hay)\b.{0,95}(?:lista|jugadores|equipos|anotados|inscriptos|cupos|torneo)|(?:la )?lista de jugadores(?: del torneo)?)/i.test(text)){
  const dest=await kv.get<{jid:string;name:string}>(DEST);
  if(!dest){await ctx.reply("📍 Todavía no configuraste un grupo de destino. Usá *.destino poner* en el grupo.");return true;}
  const status=await getTeamSignupStatus(dest.jid);
  await ctx.reply(status?"📍 *"+dest.name+"*\n\n"+status:"📋 El anuncio puede estar publicado, pero no hay inscripciones activadas para ese grupo. Escribí *.equipos iniciar negro blanco* dentro del grupo para comenzar.");
  return true;
 }
 // Órdenes reales del dueño: iniciar o reiniciar inscripciones, sin pasar por IA.
 const reset=await kv.get<{group:string;colors:string[];at:number}>(RESET);
 if(reset && /^(?:si|confirmo|dale|hazlo|hacelo|reinicia|reiniciala|confirmar)$/i.test(text)){
  const target=await kv.get<{jid:string;name:string}>(DEST);
  if(!target||target.jid!==reset.group||Date.now()-reset.at>10*60_000){
   await kv.delete(RESET);await ctx.reply("⌛ La confirmación venció o cambió el grupo. Pedime nuevamente que tome lista.");return true;
  }
  await activateTeamSignup(target.jid,reset.colors);
  await kv.delete(RESET);
  await sendText(target.jid,"📋 *LISTA NUEVA — INSCRIPCIONES ABIERTAS*\nEquipos: *"+reset.colors.map(c=>c.toUpperCase()).join(" vs ")+"*\nMandá únicamente *ID de Free Fire y color*.\nEjemplo: *123456789 "+reset.colors[0]+"*\nVerificaré el nombre antes de anotar.\nConsultá con *.equipos lista*.");
  await ctx.reply("✅ Lista reiniciada en *"+target.name+"*. Ya estoy tomando inscripciones por ID y color.");
  return true;
 }
 if(/\b(?:suplente|suplentes|reserva|reservas)\b/i.test(text)&&/\b(?:lista|inscripciones|anota|anotar|toma|tomar|abre|abrir|empeza|empieza|inicia)\b/i.test(text)){
  const target=await kv.get<{jid:string;name:string}>(DEST);
  if(!target){await ctx.reply("📍 Elegí primero el grupo con *.destino poner*.");return true;}
  const main=await getTeamSignup(target.jid);
  if(!main){await ctx.reply("⚠️ Primero creá la lista de titulares.");return true;}
  try{
   const colors=Object.keys(main.teams);
   await startSubstituteSignup(target.jid,colors);
   await sendText(target.jid,"📋 *INSCRIPCIONES DE SUPLENTES ABIERTAS*\nEquipos: *"+colors.map(c=>c.toUpperCase()).join(" vs ")+"*\nMandá *ID y color*.\nEjemplo: *123456789 "+colors[0]+"*\nSe verifica el nombre antes de anotarlo. Los titulares no se modifican.\nConsultá *.equipos suplentes lista*.");
   await ctx.reply("✅ Abrí la lista independiente de suplentes en *"+target.name+"*. Los "+Object.values(main.teams).reduce((n,p)=>n+p.length,0)+" titulares quedaron intactos.");
  }catch(e){await ctx.reply("⚠️ "+(e instanceof Error?e.message:"No pude abrir suplentes."));}
  return true;
 }
 const signupOrder=/(?:toma|tom[aá]|empeza|empez[aá]|empieza|comenza|comenz[aá]|inicia|inici[aá]|abre|abr[ií]|arma|arm[aá]|crea|cre[aá]|haz|hac[eé])\b.{0,65}\b(?:lista|inscripciones|anotados|jugadores|equipos)\b|\b(?:lista|inscripciones)\s+(?:nueva|desde cero|de nuevo)/i.test(text);
 if(signupOrder){
  const target=await kv.get<{jid:string;name:string}>(DEST);
  if(!target){await ctx.reply("📍 Primero elegí el grupo: escribí *.destino poner* dentro de ese grupo.");return true;}
  const words=text.split(/[^a-z]+/);
  const specified=["negro","rojo","blanco","azul"].filter(c=>words.includes(c));
  const previous=await getTeamSignup(target.jid);
  const colors=specified.length===2?specified:previous?Object.keys(previous.teams):[];
  if(colors.length!==2){await ctx.reply("🎨 ¿Qué dos equipos querés? Por ejemplo: *tomá lista nueva negro blanco*.");return true;}
  const count=previous?Object.values(previous.teams).reduce((n,players)=>n+players.length,0):0;
  if(count>0){
   await kv.set(RESET,{group:target.jid,colors,at:Date.now()});
   await ctx.reply("⚠️ Ya hay *"+count+" jugadores anotados*. Empezar una lista nueva los borrará de la lista activa. Respondé *confirmo* para reiniciar o *cancelar* para conservarlos.");
   return true;
  }
  await activateTeamSignup(target.jid,colors);
  await sendText(target.jid,"📋 *INSCRIPCIONES ABIERTAS*\n🏆 *"+colors.map(c=>c.toUpperCase()).join(" vs ")+"*\nMandá únicamente *ID de Free Fire y color*.\nEjemplo: *123456789 "+colors[0]+"*\nEl bot comprobará el nombre y lo anotará automáticamente.\nConsultá con *.equipos lista*.");
  await ctx.reply("✅ Ya empecé a tomar lista en *"+target.name+"*. Los jugadores pueden mandar su ID y color.");
  return true;
 }
 if(reset && cancel.test(text)){await kv.delete(RESET);await ctx.reply("✅ Cancelado. Conservé la lista anterior.");return true;}
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
    const words=pending.request.toLowerCase().split(/[^a-záéíóúñ]+/);
    const colors=["negro","rojo","blanco","azul"].filter(c=>words.includes(c));
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
