import type { Ctx } from "../core/context.ts";
import { sendText } from "../bot/client.ts";
import { isJSLeader } from "./ai/leaderIdentity.ts";

const URL="https://chfshxlykvmovwryjnxi.supabase.co/functions/v1/js-whatsapp-torneos";
const active=new Map<string,{code:string,name:string,capacity:number}>();
const busy=new Set<string>();
async function api(action:string,fields:Record<string,unknown>):Promise<any>{
 const token=process.env.JS_TORNEOS_BOT_TOKEN;
 if(!token)throw new Error("Falta configurar el acceso privado a JS Torneos");
 const response=await fetch(URL,{method:"POST",headers:{"authorization":"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({action,...fields}),signal:AbortSignal.timeout(25000)});
 const data=await response.json() as any;
 if(!response.ok||!data?.ok)throw new Error(String(data?.error||"Error de JS Torneos").slice(0,180));
 return data;
}
const states:Record<string,string>={open:"Inscripciones abiertas",closed:"Inscripciones cerradas",finished:"Terminado",cancelled:"Cancelado",canceled:"Cancelado",ongoing:"En curso",in_progress:"En curso",started:"En curso",registered:"Inscrito",pending:"Pendiente",withdrawn:"Retirado",disqualified:"Descalificado"};
const spanish=(value:string|null|undefined):string=>states[String(value||"").toLowerCase()]||String(value||"Sin información").replace(/_/g," ");
function argentinaDate(value:string|null|undefined):string{
 if(!value)return "Fecha y hora todavía no programadas";
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return "Fecha y hora todavía no programadas";
 return new Intl.DateTimeFormat("es-AR",{timeZone:"America/Argentina/Buenos_Aires",weekday:"long",day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).format(date)+" hs (Argentina)";
}
export async function tournamentCommand(ctx:Ctx):Promise<boolean>{
 if(!ctx.isGroup)return false;
 const txt=ctx.text.trim();
 const lookup=txt.match(/^[.\/](?:verificarid|jugadortorneo|buscartorneo)\s+(\d{5,16})\s*$/i);
 if(lookup){
  try{
   const result=await api("find_player",{id:lookup[1]});
   const rows=result.results as Array<{nickname:string;region:string;role:string;tournament:string;code:string;mode:string;format:string|null;status:string;team:string|null;team_status:string|null;starts_at:string|null}>;
   if(!rows.length){await ctx.reply("🔎 El ID "+lookup[1]+" no figura en los torneos registrados de JS Torneos.");return true;}
   const lines=rows.slice(0,15).map((r,i)=>`${i+1}. 🏆 *${r.tournament}* (${r.code})\n🎮 ${r.mode}${r.format?" "+spanish(r.format):""}\n📌 Estado: ${spanish(r.status)}\n📅 ${argentinaDate(r.starts_at)}\n👥 ${r.team||"Sin equipo"}${r.team_status&&r.team_status!=="registered"?" ("+spanish(r.team_status)+")":""} · ${spanish(r.role)}`);
   await ctx.reply(`🔎 *ID: ${lookup[1]}*\n👤 ${rows[0]!.nickname} · ${rows[0]!.region}\n📋 Encontrado en ${rows.length} torneo(s):\n\n${lines.join("\n\n")}${rows.length>15?"\n... y más resultados.":""}`);
  }catch(e){await ctx.reply("⚠️ No pude consultar el ID: "+(e as Error).message);}
  return true;
 }

 const create=txt.match(/^(?:js[,! ]*\s*)?(?:cre[aá]|hac[eé]|haz|arm[aá])\s+(?:un\s+)?torneo\s+br(?:\s+solo|\s+individual)?(?:\s+(?:de|para|con))?\s+(\d{1,3})\s*(?:jugadores|personas|cupos)?/i);
 const slash=txt.match(/^[.\/]torneobr\s+(\d{1,3})\s*$/i);
 const status=/^[.\/]torneobr\s+(?:estado|inscritos)$/i.test(txt);
 const stop=/^[.\/]torneobr\s+(?:pausar|detener)$/i.test(txt);
 const resume=txt.match(/^[.\/]torneobr\s+seguir\s+(JS-[A-F0-9]{8})$/i);
 if(create||slash||status||stop||resume){
  if(!isJSLeader(ctx)){await ctx.reply("⛔ Solo JS puede administrar los torneos.");return true;}
  if(status){const a=active.get(ctx.chat);if(!a){await ctx.reply("No hay inscripción automática activa.");return true;}
   try{const s=await api("status",{code:a.code});await ctx.reply(`🏆 ${s.name}: ${s.count}/${s.capacity} inscritos · ${spanish(s.status)}`);}catch(e){await ctx.reply("⚠️ "+(e as Error).message);}return true;}
  if(stop){active.delete(ctx.chat);await ctx.reply("⏸️ Dejé de recibir ID en este grupo. El torneo sigue existiendo en JS Torneos.");return true;}
  if(resume){try{const s=await api("status",{code:resume[1]});if(s.status!=="open")throw new Error("Inscripciones cerradas");active.set(ctx.chat,{code:resume[1]!,name:s.name,capacity:s.capacity});await ctx.reply(`✅ Inscripciones activadas para ${s.name} (${resume[1]}).`);}catch(e){await ctx.reply("⚠️ "+(e as Error).message);}return true;}
  const capacity=Number((create||slash)![1]);if(capacity<2||capacity>100){await ctx.reply("Los cupos deben estar entre 2 y 100.");return true;}
  if(active.has(ctx.chat)){await ctx.reply("Ya hay un torneo recibiendo ID. Usá .torneobr pausar antes de crear otro.");return true;}
  if(busy.has(ctx.chat))return true;busy.add(ctx.chat);
  try{const name="BR Solo JS Family "+new Date().toLocaleDateString("es-AR",{timeZone:"America/Argentina/Buenos_Aires"});
   const r=await api("create",{name,capacity});active.set(ctx.chat,{code:r.tournament.code,name,capacity});
   await ctx.reply(`🏆 *TORNEO BR SOLO CREADO*\n🎮 ${name}\n👥 Cupos: ${capacity}\n🔑 Código: ${r.tournament.code}\n\n📢 ¡Mandá tu ID de Free Fire (solo números) en este grupo! Voy a verificar nombre y región con Epinby y anotarte en JS Torneos.\n\nJS: .torneobr estado · .torneobr pausar`);
  }catch(e){await ctx.reply("⚠️ No pude crear el torneo: "+(e as Error).message);}finally{busy.delete(ctx.chat);}return true;
 }
 const a=active.get(ctx.chat);if(!a)return false;
 if(!/^\d{5,16}$/.test(txt))return false;
 const lock=ctx.chat+":"+txt;
 if(busy.has(lock))return true;busy.add(lock);
 try{const r=await api("register",{code:a.code,id:txt});
  let dm=true;try{await sendText(ctx.sender,`🏆 *JS TORNEOS*\n✅ Inscripción confirmada\n👤 ${r.nickname}\n🎮 ID: ${txt}\n🌎 Región: ${r.region}\n🔐 Tu código PRIVADO: ${r.private_code}\nGuardalo, lo vas a necesitar para consultar tu sala.`);}catch{dm=false;}
  await ctx.reply(`✅ *INSCRITO EN JS TORNEOS*\n👤 ${r.nickname}\n🎮 ID: ${txt}\n🌎 Región: ${r.region}\n${dm?"🔐 Te mandé tu código privado por mensaje.":"⚠️ No pude enviarte el código privado por WhatsApp. Contactá al administrador antes de jugar."}`);
  const s=await api("status",{code:a.code});if(s.count>=s.capacity){active.delete(ctx.chat);await ctx.reply("🏆 ¡CUPOS COMPLETOS! Inscripciones automáticas finalizadas.");}
 }catch(e){await ctx.reply(`⚠️ ID ${txt}: ${(e as Error).message}. No quedó inscrito.`);}finally{busy.delete(lock);}return true;
}
