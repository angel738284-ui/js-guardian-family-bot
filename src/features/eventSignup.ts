import type { Ctx } from "../core/context.ts";
import { kv } from "../db/kv.ts";
import { addEventList,updateEventList } from "./listRegistry.ts";
import { isJSLeader } from "./ai/leaderIdentity.ts";
import { isOwner } from "./access.ts";
import { epinLatamProducts,epinValidate,hasEpinbyKey } from "./epinbyApi.ts";
type Player={id:string;name:string;sender:string};
type Event={active:boolean;title:string;date:string;players:Player[];listId?:number};
const key=(group:string)=>"js:event:signup:"+group;
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Argentina/Buenos_Aires",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const busy=new Set<string>();
export async function openEventSignup(group:string,title:string):Promise<{ok:boolean;message:string}>{
 const existing=await kv.get<Event>(key(group));
 if(existing?.active&&existing.date===today()&&existing.players.length)return {ok:false,message:"Ya hay "+existing.players.length+" jugadores anotados en otra dinámica. Cerrá la inscripción anterior antes de abrir una nueva."};
 const event:Event={active:true,title:title.slice(0,100),date:today(),players:[]};
 event.listId=await addEventList(group,event.title);await kv.set(key(group),event);
 return {ok:true,message:"Inscripciones abiertas para "+title};
}
export async function manageEventSignup(group:string,action:"status"|"close"|"open"|"delete"):Promise<string>{
 const state=await kv.get<Event>(key(group));
 if(!state)return "No hay una dinámica registrada en ese grupo.";
 if(action==="delete"){
  state.active=false;await updateEventList(group,state);await kv.delete(key(group));
  return "Eliminé la dinámica «"+state.title+"» y su lista de "+state.players.length+" participantes del registro de inscripciones de Guardian. No eliminé torneos de JS Torneos ni mensajes de WhatsApp.";
 }
 if(action==="open"&&state.date!==today())return "La dinámica es de otro día. No puedo reabrirla.";
 if(action==="close"||action==="open"){
  state.active=action==="open";await kv.set(key(group),state);await updateEventList(group,state);
 }
 return "Dinámica: "+state.title+". "+state.players.length+" anotados. Inscripciones "+(state.active?"abiertas":"cerradas")+".";
}
export async function eventSignup(ctx:Ctx):Promise<boolean>{
 const text=ctx.text.trim();
 const isLeader=isOwner(ctx)||isJSLeader(ctx);
 const command=text.match(/^\.(?:evento|dinamica)\s+(lista|cerrar|abrir)$/i);
 if(command){
  if(!ctx.isGroup&&!isLeader)return false;
  const dest=ctx.isGroup?ctx.chat:(await kv.get<{jid:string}>("js_director_destination_v1"))?.jid;
  if(!dest){await ctx.reply("Primero elegí un grupo con *.destino poner*.");return true;}
  const state=await kv.get<Event>(key(dest));
  if(!state){await ctx.reply("No hay una dinámica con inscripciones creada.");return true;}
  const action=command[1]!.toLowerCase();
  if(action!=="lista"&&!isLeader){await ctx.reply("Solo JS puede abrir o cerrar las inscripciones.");return true;}
  if(action==="abrir"&&state.date!==today()){await ctx.reply("No se puede reabrir una dinámica de otro día.");return true;}
  if(action!=="lista"){state.active=action==="abrir";await kv.set(key(dest),state);await updateEventList(dest,state);}
  await ctx.reply("🎮 *"+state.title+"*\n"+(state.active?"🟢 Inscripciones abiertas":"🔒 Inscripciones cerradas")+"\n👥 "+state.players.length+" participantes\n"+(state.players.map((p,i)=>(i+1)+". "+p.name.replace(/[\r\n*]/g," ")+" — "+p.id).join("\n")||"Todavía no hay anotados."));return true;
 }
 if(!ctx.isGroup||!/^\d{5,16}$/.test(text))return false;
 const state=await kv.get<Event>(key(ctx.chat));
 if(!state?.active||state.date!==today())return false;
 if(busy.has(ctx.chat)){await ctx.reply("⏳ Estoy verificando otro ID. Intentá en unos segundos.");return true;}
 busy.add(ctx.chat);
 try{
  const fresh=await kv.get<Event>(key(ctx.chat));
  if(!fresh?.active||fresh.date!==today()){await ctx.reply("🔒 Inscripciones cerradas.");return true;}
  if(fresh.players.some(p=>p.id===text||p.sender===ctx.sender)){await ctx.reply("⚠️ Ese ID o número ya está anotado.");return true;}
  if(!hasEpinbyKey())throw Error("Verificación de ID no disponible.");
  const products=await epinLatamProducts();const product=products.find(p=>p.supports_player_validation===true);
  if(!product)throw Error("No hay un producto habilitado para verificar IDs.");
  const player=await epinValidate(product.id,text);
  const name=(player.nickname??player.player_name??"").trim();
  if(player.nickname_verified!==true||!name)throw Error("No se pudo verificar el nombre.");
  const region=String(player.region??"").toUpperCase();
  if(region&&!["SAC","LATAM","LA","SA","AR","ARGENTINA","SOUTH AMERICA"].includes(region))throw Error("ID de otra región.");
  fresh.players.push({id:text,name:name.slice(0,65),sender:ctx.sender});await kv.set(key(ctx.chat),fresh);await updateEventList(ctx.chat,fresh);
  await ctx.reply("✅ *ANOTADO EN LA DINÁMICA*\n"+fresh.players.length+". "+name.replace(/[\r\n*]/g," ")+" — "+text+"\nTotal: "+fresh.players.length+". Consultá *.evento lista*.");
 }catch(e){await ctx.reply("⚠️ No pude anotar el ID: "+(e instanceof Error?e.message:"Error temporal"));}
 finally{busy.delete(ctx.chat);}
 return true;
}
