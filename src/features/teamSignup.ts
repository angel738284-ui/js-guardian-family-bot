import type { Ctx } from "../core/context.ts";
import { kv } from "../db/kv.ts";
import { sendText } from "../bot/client.ts";
import { epinLatamProducts, epinValidate, hasEpinbyKey } from "./epinbyApi.ts";
import { isOwner } from "./access.ts";
import { isJSLeader } from "./ai/leaderIdentity.ts";

const key=(group:string)=>"js_team_signup:"+group;
const subKey=(group:string)=>"js_team_substitutes:"+group;
type Player={id:string;name:string;sender:string};
export type Signup={active:boolean;teams:Record<string,Player[]>;created:number};
const locks=new Set<string>();
export async function startSubstituteSignup(group:string,colors:string[]):Promise<void>{
 const existing=await kv.get<Signup>(subKey(group));
 if(existing&&Object.values(existing.teams).some(p=>p.length))throw new Error("Ya hay suplentes anotados. No se reemplazó la lista.");
 const teams:Record<string,Player[]>={};
 for(const c of colors)teams[c.toLowerCase()]=[];
 await kv.set(subKey(group),{active:true,teams,created:Date.now()} satisfies Signup);
}
export async function getSubstituteStatus(group:string):Promise<string|null>{
 const s=await kv.get<Signup>(subKey(group));
 if(!s)return null;
 return (s.active?"🟢":"🔒")+" *SUPLENTES*\n"+Object.entries(s.teams).map(([c,p])=>"*"+c.toUpperCase()+"* ("+p.length+")\n"+(p.length?p.map((x,i)=>(i+1)+". "+x.name+" — "+x.id).join("\n"):"Sin suplentes")).join("\n\n");
}
export async function getTeamSignup(group:string):Promise<Signup|null>{
 return kv.get<Signup>(key(group));
}
export async function activateTeamSignup(group:string,colors:string[]):Promise<void>{
 const teams:Record<string,Player[]>={};
 for(const color of colors)teams[color.toLowerCase()]=[];
 await kv.set(key(group),{active:true,teams,created:Date.now()} satisfies Signup);
}
export async function teamSignup(ctx:Ctx):Promise<boolean>{
 if(!ctx.isGroup)return false;
 const start=ctx.text.trim().match(/^\.equipos\s+(?:iniciar|abrir)\s+(negro|rojo|blanco|azul)\s+(negro|rojo|blanco|azul)$/i);
 if(start){
  if(!(isOwner(ctx)||isJSLeader(ctx))){await ctx.reply("⛔ Solo JS puede iniciar inscripciones.");return true;}
  if(start[1]!.toLowerCase()===start[2]!.toLowerCase()){await ctx.reply("⚠️ Elegí dos colores distintos.");return true;}
  await activateTeamSignup(ctx.chat,[start[1]!,start[2]!]);
  await ctx.reply("✅ *INSCRIPCIONES ABIERTAS*\nMandá *ID y color*, por ejemplo: *123456789 blanco*.\nVerificaré el nombre antes de anotar.\nUsá *.equipos lista* para consultar los equipos.");
  return true;
 }
 const signup=await kv.get<Signup>(key(ctx.chat));
 const substitutes=await kv.get<Signup>(subKey(ctx.chat));
 const txt=ctx.text.trim();
 if(/^\.equipos\s+suplentes(?:\s+lista)?$/i.test(txt)){
  await ctx.reply(await getSubstituteStatus(ctx.chat)??"📋 No hay lista de suplentes abierta.");return true;
 }
 if(/^\.equipos\s+suplentes\s+cerrar$/i.test(txt)&&(isOwner(ctx)||isJSLeader(ctx))){
  if(substitutes){substitutes.active=false;await kv.set(subKey(ctx.chat),substitutes);}
  await ctx.reply("🔒 Inscripciones de suplentes cerradas.");return true;
 }
 if(/^\.equipos\s+(?:lista|estado)$/i.test(txt)){
  await ctx.reply(signup?await getTeamSignupStatus(ctx.chat)??render(signup):"📋 Todavía no hay inscripciones configuradas en este grupo. JS puede iniciarlas con *.equipos iniciar negro blanco*.");return true;
 }
 if(!signup?.active&&!substitutes?.active)return false;
 const isAdmin=isOwner(ctx)||isJSLeader(ctx);
 if(/^\.equipos\s+(?:cerrar|pausar)$/i.test(txt)&&isAdmin&&signup){
  signup.active=false;await kv.set(key(ctx.chat),signup);await ctx.reply("🔒 Inscripciones de equipos cerradas.");return true;
 }
 const m=txt.match(/^(\d{5,16})\s+(negro|rojo|blanco|azul)$/i)??txt.match(/^(negro|rojo|blanco|azul)\s+(\d{5,16})$/i);
 if(!m)return false;
 const id=/^\d+$/.test(m[1]!)?m[1]!:m[2]!;
 const color=(id===m[1]?m[2]:m[1])!.toLowerCase();
 const isSub=Boolean(substitutes?.active)&&(!signup?.active||signup.teams[color]?.length===6);
 const current=isSub?substitutes:signup;
 if(!current?.active||!Object.hasOwn(current.teams,color))return false;
 if(locks.has(ctx.chat)){await ctx.reply("⏳ Estoy verificando otro ID. Reintentá en unos segundos.");return true;}
 locks.add(ctx.chat);
 try{
  const fresh=await kv.get<Signup>(isSub?subKey(ctx.chat):key(ctx.chat));
  if(!fresh?.active)return true;
  const other=await kv.get<Signup>(isSub?key(ctx.chat):subKey(ctx.chat));
  const existing=[...Object.values(fresh.teams).flat(),...Object.values(other?.teams??{}).flat()].find(p=>p.id===id||p.sender===ctx.sender);
  if(existing){await ctx.reply("⚠️ Ya hay una inscripción con este ID o número de WhatsApp. Pedile a JS que revise la lista.");return true;}
  if(!isSub&&fresh.teams[color]!.length>=6){await ctx.reply("⚠️ El equipo "+color+" ya tiene sus seis cupos completos.");return true;}
  if(!hasEpinbyKey()){await ctx.reply("⚠️ La verificación de ID no está disponible. No voy a anotar nombres sin comprobarlos.");return true;}
  const products=await epinLatamProducts();
  const product=products.find(p=>p.supports_player_validation===true);
  if(!product)throw new Error("No hay un producto habilitado para verificar IDs.");
  const player=await epinValidate(product.id,id);
  const name=(player.nickname??player.player_name??"").trim();
  if(player.nickname_verified!==true||!name)throw new Error("No se pudo comprobar el nombre de este ID.");
  const region=String(player.region??"").toUpperCase();
  if(region&&!["SAC","LATAM","LA","SA","AR","ARGENTINA","SOUTH AMERICA"].includes(region))throw new Error("Este ID pertenece a otra región ("+region+").");
  fresh.teams[color]!.push({id,name:name.slice(0,65),sender:ctx.sender});
  await kv.set(isSub?subKey(ctx.chat):key(ctx.chat),fresh);
  await ctx.reply("✅ *"+(isSub?"SUPLENTE":"INSCRIPCIÓN")+" CONFIRMADO*\n👤 "+name+"\n🎮 ID: "+id+"\n🎨 Equipo: "+color.toUpperCase()+"\n📊 Cupos: "+fresh.teams[color]!.length+"/6\n\n"+render(fresh));
  if(!isSub&&Object.values(fresh.teams).every(t=>t.length===6)){
   fresh.active=false;await kv.set(key(ctx.chat),fresh);
   await sendText(ctx.chat,"🏆 *¡EQUIPOS COMPLETOS!*\n"+render(fresh)+"\n🔒 Inscripciones cerradas automáticamente.");
  }
 }catch(e){await ctx.reply("⚠️ No pude verificar ese ID: "+(e instanceof Error?e.message:"error temporal")+". No quedó inscrito.");}
 finally{locks.delete(ctx.chat);}
 return true;
}
export async function getTeamSignupStatus(group:string):Promise<string|null>{
 const signup=await kv.get<Signup>(key(group));
 if(!signup)return null;
 const count=Object.values(signup.teams).reduce((sum,players)=>sum+players.length,0);
 return (signup.active?"🟢 *INSCRIPCIONES ABIERTAS*":"🔒 *INSCRIPCIONES CERRADAS*")+"\n📊 *Anotados:* "+count+"/12\n\n"+render(signup);
}
function render(s:Signup):string{
 return "🏆 *LISTA DEL TORNEO*\n\n"+Object.entries(s.teams).map(([color,players])=>
  (color==="negro"?"⚫":color==="rojo"?"🔴":"⚪")+" *EQUIPO "+color.toUpperCase()+"* ("+players.length+"/6)\n"+
  Array.from({length:6},(_,i)=>String(i+1)+". "+(players[i]?players[i]!.name+" — "+players[i]!.id:"Disponible")).join("\n")
 ).join("\n\n");
}
