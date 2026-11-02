import type { Ctx } from "../core/context.ts";
import { kv } from "../db/kv.ts";
import { isOwner } from "./access.ts";
import { isJSLeader } from "./ai/leaderIdentity.ts";
type Player={id:string;name:string;sender:string};
type Entry={id:number;kind:"event"|"team";title:string;active:boolean;players:Player[];created:number};
type Registry={next:number;entries:Entry[]};
type Event={active:boolean;title:string;date:string;players:Player[];listId?:number};
type Team={active:boolean;teams:Record<string,Player[]>;created:number};
const rk=(g:string)=>"js:lists:v1:"+g;
const ek=(g:string)=>"js:event:signup:"+g;
const tk=(g:string)=>"js_team_signup:"+g;
const pk=(g:string)=>"js:lists:pending:"+g;
export async function listRegistry(group:string):Promise<Registry>{
 const r=await kv.get<Registry>(rk(group))??{next:1,entries:[]};
 const ev=await kv.get<Event>(ek(group));
 if(ev&&!r.entries.some(e=>e.kind==="event"&&e.id===ev.listId)){
  const id=r.next++;r.entries.push({id,kind:"event",title:ev.title,active:ev.active,players:ev.players,created:Date.now()});ev.listId=id;await kv.set(ek(group),ev);await kv.set(rk(group),r);
 }
 const team=await kv.get<Team>(tk(group));
 if(team&&!r.entries.some(e=>e.kind==="team")){
  r.entries.push({id:r.next++,kind:"team",title:"Equipos anteriores",active:team.active,players:Object.values(team.teams).flat(),created:team.created});await kv.set(rk(group),r);
 }
 return r;
}
export async function addEventList(group:string,title:string):Promise<number>{
 const r=await listRegistry(group);const id=r.next++;
 r.entries.push({id,kind:"event",title,active:true,players:[],created:Date.now()});await kv.set(rk(group),r);return id;
}
export async function updateEventList(group:string,ev:Event):Promise<void>{
 if(!ev.listId)return;
 const r=await listRegistry(group);const entry=r.entries.find(e=>e.id===ev.listId);
 if(entry){entry.players=ev.players;entry.active=ev.active;await kv.set(rk(group),r);}
}
export async function numberedLists(ctx:Ctx):Promise<boolean>{
 const text=ctx.text.trim().toLowerCase();
 if(!/^\.(?:listas(?:\s+borrar\s+todas)?|lista\s*(?:\d+|borrar\s+\d+|confirmar|cancelar))$/.test(text))return false;
 if(ctx.fromMe||!(isOwner(ctx)||isJSLeader(ctx))){await ctx.reply("Solo JS puede administrar estas listas.");return true;}
 const group=ctx.isGroup?ctx.chat:(await kv.get<{jid:string}>("js_director_destination_v1"))?.jid;
 if(!group){await ctx.reply("Elegí un grupo con *.destino poner*.");return true;}
 const r=await listRegistry(group);
 if(text===".lista cancelar"){await kv.delete(pk(group));await ctx.reply("Cancelado. No borré ninguna lista.");return true;}
 if(text===".lista confirmar"){
  const p=await kv.get<{ids:number[];at:number}>(pk(group));
  if(!p||Date.now()-p.at>300000){await ctx.reply("No hay eliminación pendiente válida.");return true;}
  const ev=await kv.get<Event>(ek(group));if(ev?.listId&&p.ids.includes(ev.listId))await kv.delete(ek(group));
  if(p.ids.some(id=>r.entries.some(e=>e.id===id&&e.kind==="team")))await kv.delete(tk(group));
  r.entries=r.entries.filter(e=>!p.ids.includes(e.id));await kv.set(rk(group),r);await kv.delete(pk(group));
  await ctx.reply("🗑️ Eliminé "+p.ids.length+" lista(s) de Guardian. No borré mensajes ni torneos de la aplicación.");return true;
 }
 const erase=text.match(/^\.lista borrar (\d+)$/);const all=text===".listas borrar todas";
 if(erase||all){
  const ids=all?r.entries.map(e=>e.id):[Number(erase![1])];
  if(!ids.length||ids.some(id=>!r.entries.some(e=>e.id===id))){await ctx.reply("No encontré esas listas.");return true;}
  await kv.set(pk(group),{ids,at:Date.now()});await ctx.reply("⚠️ Vas a borrar "+ids.map(id=>"lista "+id).join(", ")+". Respondé *.lista confirmar* o *.lista cancelar* (5 minutos).");return true;
 }
 const detail=text.match(/^\.lista\s*(\d+)$/);
 if(detail){const e=r.entries.find(e=>e.id===Number(detail[1]));await ctx.reply(e?"📋 *LISTA "+e.id+" — "+e.title+"*\n"+(e.active?"🟢 Abierta":"🔒 Cerrada")+"\n"+(e.players.map((p,i)=>(i+1)+". "+p.name.replace(/[\r\n*]/g," ")+" — "+p.id).join("\n")||"Sin participantes.").slice(0,3500):"No existe esa lista.");return true;}
 await ctx.reply("📚 *LISTAS*\n"+(r.entries.map(e=>"*.lista"+e.id+"* · "+e.title+" · "+e.players.length+" jugadores · "+(e.active?"abierta":"cerrada")).join("\n")||"No hay listas.")+"\nBorrar: *.lista borrar 2* o *.listas borrar todas*.");return true;
}
