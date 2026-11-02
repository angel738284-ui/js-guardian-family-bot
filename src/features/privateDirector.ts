import type { Ctx } from "../core/context.ts";
import { isOwner } from "./access.ts";
import { isJSLeader } from "./ai/leaderIdentity.ts";
import { kv } from "../db/kv.ts";
import { sendText } from "../bot/client.ts";
import { kieConfigured, kieGenerate } from "./ai/kie.ts";
import { eventChecklist } from "./ai/intelligent.ts";
import { openEventSignup, manageEventSignup } from "./eventSignup.ts";
import { activateTeamSignup, getTeamSignup, getTeamSignupStatus, startSubstituteSignup, getSubstituteStatus, applyRosterAction, type RosterAction } from "./teamSignup.ts";

const DEST="js_director_destination_v1";
const DRAFT="js_director_draft_v1";
const RESET="js_director_signup_reset_v1";
const EDIT="js_director_roster_edit_v1";
type Draft={text:string;group:string;created:number;request:string;revisions?:string[]};
const leader=(ctx:Ctx)=>!ctx.fromMe&&(isOwner(ctx)||isJSLeader(ctx));
const normalized=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const confirm=/^(?:si[,! ]*)?(?:publicalo|publica|mandalo|envialo|enviar|confirmo|confirmar|dale[,! ]*mandalo)(?:\s+y\s+(?:(?:empeza|empieza|comenza|comienza|inicia|abri|ponete|pone)\s+a?\s*)?(?:tomar|toma|anotar|anota|recibir|recibi)\s*(?:los?\s+)?(?:ids?|inscripciones|lista))?\s*[.!]*$/i;
const cancel=/^(?:cancelar|cancela|no lo mandes|descartar|olvidalo)\s*[.!]*$/i;
const requests=/(?:crea|creame|arm[aá]|armes|armame|prepar[aá]|preparame|hac[eé]|haceme|haz|redact[aá]|redactame|organiza|organizame|publica|manda|envia|anuncia)/;
const topics=/(?:torneo|6\s*(?:vs|v|contra|x)\s*6|enfrentamiento|equipo|lista|anuncio|aviso|comunicado|mensaje|dinamica|evento|juego|purga)/;

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
 // Acciones administrativas explícitas, exclusivamente en el chat privado del dueño verificado.
 const adminKey="js_director_event_admin_pending_v1";
 const adminPending=await kv.get<{group:string;action:"delete";created:number}>(adminKey);
 if(adminPending&&/^(?:confirmo|confirmar|si|dale|hacelo|borralo)[.! ]*$/i.test(text)){
  await kv.delete(adminKey);
  const target=await kv.get<{jid:string;name:string}>(DEST);
  if(!target||target.jid!==adminPending.group||Date.now()-adminPending.created>5*60_000){await ctx.reply("La confirmación venció o cambió el grupo. No borré nada.");return true;}
  await ctx.reply("✅ "+await manageEventSignup(target.jid,"delete"));return true;
 }
 if(adminPending&&/^(?:cancelar|cancela|no|dejalo|olvidalo)$/i.test(text)){
  await kv.delete(adminKey);await ctx.reply("Cancelado. No borré la dinámica.");return true;
 }
 const eventWords=/\b(?:dinamica|evento|torneo|inscripciones)\b/;
 const deleteEvent=/\b(?:borra|borrar|borralo|elimina|eliminar|eliminalo|anula|anular)\b/;
 const closeEvent=/\b(?:cerra|cerrar|cierra|detene|detener|para|parar)\b/;
 const openEvent=/\b(?:abri|abrir|abre|reanuda|reanudar)\b/;
 if(eventWords.test(text)&&(deleteEvent.test(text)||closeEvent.test(text)||openEvent.test(text))){
  const target=await kv.get<{jid:string;name:string}>(DEST);
  if(!target){await ctx.reply("Primero elegí el grupo con *.destino poner*.");return true;}
  if(deleteEvent.test(text)){
   await kv.set(adminKey,{group:target.jid,action:"delete",created:Date.now()});
   await ctx.reply("⚠️ ¿Confirmás eliminar la dinámica y todos sus anotados del registro de Guardian en *"+target.name+"*? No se borrarán torneos de la app JS Torneos. Respondé *confirmo* o *cancelar* (5 minutos).");return true;
  }
  const action=closeEvent.test(text)?"close":"open";
  await ctx.reply("✅ "+await manageEventSignup(target.jid,action));return true;
 }
 // Interpretación de órdenes sobre titulares: vista previa y confirmación antes de escribir.
 const edit=await kv.get<{group:string;action:RosterAction;created:number}>(EDIT);
 if(edit&&/^(?:si|confirmo|confirmar|dale|hazlo|hacelo|ejecuta|aplica)(?:[.! ]*)$/i.test(text)){
  const target=await kv.get<{jid:string;name:string}>(DEST);
  if(!target||target.jid!==edit.group||Date.now()-edit.created>10*60_000){
   await kv.delete(EDIT);await ctx.reply("⌛ La orden venció o cambió el grupo. No modifiqué nada.");return true;
  }
  try{
   const result=await applyRosterAction(target.jid,edit.action);
   await kv.delete(EDIT);
   await ctx.reply(result);
   await sendText(target.jid,"📢 *ACTUALIZACIÓN DE EQUIPOS*\n"+result);
  }catch(e){await kv.delete(EDIT);await ctx.reply("⚠️ No pude aplicar el cambio: "+(e instanceof Error?e.message:"Error temporal"));}
  return true;
 }
 if(edit&&/^(?:cancelar|cancela|no|dejalo|olvidalo)$/i.test(text)){
  await kv.delete(EDIT);await ctx.reply("✅ Cambio cancelado. No modifiqué jugadores.");return true;
 }
 const editIntent=/\b(?:saca|sac[aá]|quita|quit[aá]|elimina|elimin[aá]|borra|borr[aá]|retira|retir[aá]|mueve|mov[eé]|pasa|pas[aá]|cambia|cambi[aá]|reemplaza|reemplaz[aá]|sustituye)\b/i.test(text)&&/\b(?:jugador|equipo|titular|id|negro|blanco|rojo|azul|suplente|lista)\b|\d{5,16}/i.test(text);
 if(editIntent){
  const target=await kv.get<{jid:string;name:string}>(DEST);
  if(!target){await ctx.reply("📍 Primero elegí un grupo de destino.");return true;}
  const main=await getTeamSignup(target.jid);
  if(!main){await ctx.reply("📋 No hay una lista de titulares activa para modificar.");return true;}
  const ids=Array.from(text.matchAll(/\b\d{5,16}\b/g),m=>m[0]);
  const colors=Object.keys(main.teams);
  const mentioned=colors.filter(c=>new RegExp("\\b"+c+"\\b").test(text));
  const ordinal=text.match(/(?:jugador|puesto|numero|nro|posicion)\s*(?:n[uú]mero\s*)?([1-6])\b/);
  const origin=mentioned[0];
  let id=ids[0];
  if(!id&&ordinal&&origin)id=main.teams[origin]?.[Number(ordinal[1])-1]?.id;
  if(!id){await ctx.reply("🎮 Decime el *ID del jugador* que querés cambiar, o su puesto y color. Ejemplo: *sacá al jugador 3 del equipo negro*.");return true;}
  const kind:RosterAction["kind"]=/\b(?:reemplaza|reemplaz[aá]|sustituye|suplente)\b/.test(text)?"replace":/\b(?:mueve|mov[eé]|pasa|pas[aá]|cambia|cambi[aá])\b/.test(text)?"move":"remove";
  const current=colors.find(c=>main.teams[c]?.some(p=>p.id===id));
  if(!current){await ctx.reply("⚠️ No encontré ese jugador en la lista de titulares.");return true;}
  const destColor=mentioned.find(c=>c!==current);
  if(kind==="move"&&!destColor){await ctx.reply("🎨 ¿A qué equipo lo querés pasar? Indicá el color de destino.");return true;}
  const player=main.teams[current]!.find(p=>p.id===id)!;
  const action:RosterAction={kind,id,color:destColor};
  await kv.set(EDIT,{group:target.jid,action,created:Date.now()});
  await ctx.reply("📝 *CONFIRMAR CAMBIO*\n👤 "+player.name+"\n🎮 "+id+"\n📍 Equipo actual: "+current.toUpperCase()+"\n🔧 Acción: "+(kind==="remove"?"Retirar de titulares":kind==="replace"?"Reemplazar por el primer suplente":"Pasar al equipo "+destColor?.toUpperCase())+"\n\nRespondé *confirmo* para aplicar y publicar la lista actualizada, o *cancelar*.");
  return true;
 }
 // Si la solicitud es ambigua, pedir cambios concretos en vez de reiniciar.
 if(/\b(?:quiero|necesito|vamos a|haceme|hace|hacer)\b.{0,35}\b(?:cambios|modificaciones)\b|\b(?:estos son los jugadores|toma estos|actualiza la lista|modifica la lista)\b/i.test(text)){
  const dest=await kv.get<{jid:string;name:string}>(DEST);
  const status=dest?await getTeamSignupStatus(dest.jid):null;
  await kv.delete(RESET);
  await ctx.reply("📝 *VAMOS A EDITAR LA LISTA*\n"+(status?"Tengo la lista de *"+dest!.name+"* guardada. Los titulares no se borrarán.\n\n":"")+"Decime el cambio exacto, por ejemplo:\n• *Sacá al jugador 3 del Negro*\n• *Reemplazá al jugador 2 del Blanco por el primer suplente*\n• *Pasá al jugador con ID 123456789 al Blanco*\n\nTe pediré confirmación antes de modificarla.");
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
 // Una orden de PUBLICAR tiene prioridad sobre cualquier lista de equipos anterior.
 // Nunca reinterpretar "mandalo y toma lista" como "reiniciar los 12 titulares".
 const publishAndSignup=/^(?:mandalo|mand[aá]lo|publicalo|public[aá]lo|envialo|envi[aá]lo|subilo|sub[ií]lo|pasalo|pas[aá]lo)\s+y\s+(?:toma|tom[aá]|tomar|anota|anot[aá]|anotar|recibi|recib[ií]|recibir|abri|abr[ií]|abrir|empeza|empez[aá]|empezar)\s*(?:la\s+)?(?:lista|ids?|inscripciones)[.! ]*$/i;
 if(publishAndSignup.test(text)){
  const target=await kv.get<{jid:string;name:string}>(DEST);
  if(!target){await ctx.reply("Primero elegí el grupo con *.destino poner*.");return true;}
  const current=await kv.get<Draft>(DRAFT);
  const quoted=ctx.message.quoted?.text?.trim();
  if(!current&&quoted&&quoted.length>=40){
   await kv.set(DRAFT,{text:quoted,group:target.jid,created:Date.now(),request:"publicar dinamica y tomar id",revisions:[]} satisfies Draft);
   await ctx.reply("📋 Preparé el anuncio citado para *"+target.name+"*. Respondé *confirmo* para publicarlo y abrir una lista nueva de IDs de esta dinámica, o *cancelar*. La lista anterior de equipos quedará intacta.");return true;
  }
  if(!current){await ctx.reply("No tengo un anuncio listo. Respondé al mensaje completo con *mandalo y toma lista*.");return true;}
  // El bloque de confirmación existente publicará el borrador; no reinicia equipos.
  await ctx.reply("📋 Tengo un borrador listo para *"+target.name+"*. Respondé *publicalo y toma id* para enviarlo y abrir la inscripción de la dinámica. No se borrarán los 12 jugadores de la lista anterior.");return true;
 }
 // Reiniciar requiere una intención explícita; "tomá estos son los jugadores" NO es reiniciar.
 const signupOrder=/\b(?:lista|inscripciones)\s+(?:nueva|desde cero|de nuevo)\b|\b(?:reinicia|reiniciar|resetea|resetear|borra|borrar)\b.{0,40}\b(?:lista|inscripciones|equipos)\b|\b(?:empeza|empezar|empieza|comenza|comenzar|inicia|iniciar|abre|abrir|crea|crear|arma|armar|toma|tomar)\b.{0,35}\b(?:lista|inscripciones)\b/i.test(text)&&!/\b(?:quiero hacer estos cambios|estos son los jugadores|toma estos|modifica|modificar|actualiza|actualizar)\b/i.test(text);
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
 // Publicación solicitada citando el anuncio: preparar una confirmación real, nunca delegar a la IA.
 const quotedPublish=/^(?:publicalo|publica|mandalo|envialo)(?:\s+y\s+(?:toma|tomar|anota|anotar|recibi|recibir)\s*(?:los?\s+)?(?:ids?|inscripciones|lista))?[.! ]*$/i;
 const existingDraft=await kv.get<Draft>(DRAFT);
 if(quotedPublish.test(text)&&!existingDraft){
  const target=await kv.get<{jid:string;name:string}>(DEST);
  if(!target){await ctx.reply("Elegí primero el grupo con *.destino poner*.");return true;}
  const quoted=ctx.message.quoted?.text?.trim();
  if(!quoted||quoted.length<40){await ctx.reply("No encuentro un borrador guardado. Respondé al anuncio completo con *publicalo y toma ID* para prepararlo.");return true;}
  await kv.set(DRAFT,{text:quoted,group:target.jid,created:Date.now(),request:raw+" dinamica",revisions:[]} satisfies Draft);
  await ctx.reply("📋 Tengo el anuncio citado y el destino *"+target.name+"*. Respondé *confirmo* para publicarlo"+(/\b(?:id|lista|inscripciones)\b/.test(text)?" y abrir inscripciones por ID":"")+", o *cancelar*.");return true;
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
   const signupRequested=/\b(?:anot[aá]|anotar|tom[aá]|tomar|inscripci[oó]n|inscripciones|recib[ií]|recibir)\b.{0,25}\b(?:ids?|jugadores|participantes)\b|\b(?:ids?|jugadores)\b.{0,25}\b(?:anot[aá]|anotar|inscripci[oó]n)\b/i.test(normalized(pending.request+" "+raw));
   const isEvent=/\b(?:dinamica|evento|juego|torreta|toma id|tomar id)\b/i.test(normalized(pending.request+" "+pending.text));
   const eventPlan=isEvent&&signupRequested?await openEventSignup(dest.jid,"Dinámica JS"):null;
   if(eventPlan&&!eventPlan.ok){await ctx.reply("⚠️ "+eventPlan.message+" No publiqué el anuncio para evitar abrir otra lista.");return true;}
   await sendText(dest.jid,pending.text);
   if(eventPlan?.ok)await sendText(dest.jid,"📋 *INSCRIPCIONES ABIERTAS — DINÁMICA JS*\nMandá solamente tu *ID de Free Fire* en este grupo. Guardian verificará tu nombre y te anotará.\nConsultá *.evento lista*. JS puede cerrar con *.evento cerrar*.");
   if(/6\s*(?:vs|v|x|contra)\s*6/i.test(pending.request)){
    const words=pending.request.toLowerCase().split(/[^a-záéíóúñ]+/);
    const colors=["negro","rojo","blanco","azul"].filter(c=>words.includes(c));
    if(colors.length===2){
     await activateTeamSignup(dest.jid,colors);
     await sendText(dest.jid,"📋 *INSCRIPCIONES AUTOMÁTICAS ABIERTAS*\nMandá únicamente tu *ID de Free Fire y color*.\nEjemplo: *123456789 negro*\nVerificaré el nombre del ID y lo agregaré al equipo elegido.\nUsá *.equipos lista* para ver los cupos.");
    }
   }
   await kv.set(DRAFT,null);
   await ctx.reply("✅ Publicado en *"+dest.name+"*."+(eventPlan?.ok?" Ya estoy tomando IDs verificados. Consultá *.evento lista*.":""));
  }catch{await ctx.reply("⚠️ No pude publicar el anuncio. Revisá que el bot siga en el grupo y probá otra vez.");}
  return true;
 }
 if(pending&&Date.now()-pending.created<=30*60_000&& !raw.startsWith(".") && !confirm.test(text) && !cancel.test(text)){
  const correction=/\b(?:no[, ]|asi no|no es|no era|corregi|corregime|cambia|cambiame|modifica|mejor|agrega|quita|saca|en vez|quise decir|ultimo|torreta|ganador|premio|horario|regla|pone|pon[eé]|falta)\b/i.test(text);
  if(correction){
   if(!kieConfigured()){await ctx.reply("⚠️ La IA no está disponible para corregir el borrador.");return true;}
   try{
    const revised=await kieGenerate(
     "Estás editando un BORRADOR de anuncio de Free Fire. "+eventChecklist(pending.request,raw)+"\nTexto original del dueño (fuente de verdad):\n"+pending.request+"\n\nBORRADOR ACTUAL:\n"+pending.text+"\n\nCORRECCIONES PREVIAS EN ORDEN:\n"+(pending.revisions??[]).map((x,i)=>(i+1)+". "+x).join("\n")+"\n\nCORRECCIÓN NUEVA DEL DUEÑO:\n"+raw+"\n\nDevolvé SOLAMENTE el anuncio completo corregido. Respetá literalmente mecánicas, objetos y condiciones de victoria. TORRETA no es TORRE. Si el dueño dice que gana el ÚLTIMO que le dé a la TORRETA, jamás cambies eso por el último en darle a una torre. No inventes reglas, premios ni jugadores. Conservá las partes no corregidas. Español argentino, formato WhatsApp.",
     "JS",2,[],[],true,"","","",[],"","high"
    );
    await kv.set(DRAFT,{...pending,text:revised,revisions:[...(pending.revisions??[]),raw].slice(-8),created:Date.now()});
    await ctx.reply("✏️ *BORRADOR CORREGIDO — NO PUBLICADO*\n\n"+revised+"\n\nRespondé *publicalo* para enviarlo o seguí corrigiéndome.");
   }catch{await ctx.reply("⚠️ No pude corregir el borrador ahora. Sigue guardada la versión anterior.");}
   return true;
  }
 }
 if(!requests.test(text)||!topics.test(text))return false;
 const target=await kv.get<{jid:string;name:string}>(DEST);
 if(!target){await ctx.reply("📍 Primero elegí el grupo donde querés publicar: entrá a ese grupo y mandá *.destino poner*. Después volvé acá y pedime el anuncio.");return true;}
 if(!kieConfigured()){await ctx.reply("⚠️ Para redactar anuncios con IA necesito que Kie esté configurado.");return true;}
 await ctx.reply("📝 Voy a preparar el borrador. No publicaré nada sin tu confirmación.");
 try{
  const draft=await kieGenerate(
   "Redactá SOLO un mensaje de WhatsApp listo para publicar en un grupo de Free Fire. "+eventChecklist(raw)+"\nPedido del dueño: "+raw+
   "\nReglas: español argentino, claro, ordenado, con emojis moderados y títulos con *asteriscos* de WhatsApp. Si pide un torneo 6 vs 6, hacé dos listas de seis lugares numerados por equipo; no inventes jugadores, fecha, premio, reglas ni datos no proporcionados. Si pide Negro vs Rojo, respetá esos nombres. Diferenciá TORRETA de TORRE y conservá literalmente quién gana, incluso si es el último en dispararle a la torreta. Si una regla no está clara, no la inventes. No digas que creaste un torneo real ni que ya se publicó. No incluyas explicaciones fuera del anuncio.",
   "JS",2,[],[],true,"","","",[],"","high"
  );
  await kv.set(DRAFT,{text:draft,group:target.jid,created:Date.now(),request:raw} satisfies Draft);
  await ctx.reply("📋 *VISTA PREVIA*\n📍 Destino: *"+target.name+"*\n\n"+draft+"\n\n────────────\nRespondé *publicalo* para enviarlo, o *cancelar* para descartarlo. El borrador vence en 30 minutos.");
 }catch{await ctx.reply("⚠️ No pude preparar el anuncio con IA. Probá otra vez en unos segundos.");}
 return true;
}
