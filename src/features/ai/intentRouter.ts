import type { Ctx } from "../../core/context.ts";
import { isJSLeader } from "./leaderIdentity.ts";
import { isOwner } from "../access.ts";
import { kieConfigured, kieGenerate } from "./kie.ts";
import { privateDirector } from "../privateDirector.ts";
import { kv } from "../../db/kv.ts";
import { manageEventSignup } from "../eventSignup.ts";

// Narrow, auditable tool router. Model output is never executed as code.
type Intent="publish"|"publish_signup"|"close_signup"|"open_signup"|"delete_event"|"list_signup"|"none";
const actions=new Set<Intent>(["publish","publish_signup","close_signup","open_signup","delete_event","list_signup","none"]);
const gate=/\b(?:public|mand|envi|subil|pasal|anunci|anot|inscrip|lista|dinamic|event|torneo|borra|elimin|anula|cerra|cerr|abri|abr|particip|jugador|id)\w*/i;
const normalize=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
export async function routeLeaderIntent(ctx:Ctx):Promise<boolean>{
 if(ctx.isGroup||ctx.fromMe||!(isOwner(ctx)||isJSLeader(ctx))||!kieConfigured()||!gate.test(normalize(ctx.text))||ctx.text.trim().startsWith("."))return false;
 const target=await kv.get<{jid:string;name:string}>("js_director_destination_v1");
 const draft=await kv.get<{text:string;created:number}>("js_director_draft_v1");
 const quote=ctx.message.quoted?.text?.slice(0,700)??"";
 let intent:Intent="none";
 try{
  const output=await kieGenerate(
   "Clasificá la intención del MENSAJE del dueño, sin ejecutar nada. Respondé SOLAMENTE JSON válido {\"intent\":\"...\"}. Opciones: publish (enviar anuncio al grupo), publish_signup (enviar anuncio y comenzar a recibir IDs), close_signup (cerrar inscripciones), open_signup (reabrir inscripciones), delete_event (borrar registro de dinámica/torneo), list_signup (consultar participantes), none (charla, duda, ambigüedad, edición de borrador). No inventes intención. Si el mensaje pide redactar/preparar y no publicar: none. Si menciona borrar un mensaje de WhatsApp, none. Contexto: borrador="+(draft?"sí":"no")+", mensaje citado="+(quote?"sí":"no")+", grupo destino="+(target?"sí":"no")+". MENSAJE: "+JSON.stringify(ctx.text.slice(0,400))+". CITADO: "+JSON.stringify(quote.slice(0,250)),
   "JS",2,[],[],true,"","","",[],"","low",true
  );
  const parsed=JSON.parse((output.match(/\{[\s\S]*?\}/)?.[0]??"{}")) as {intent?:Intent};
  if(parsed.intent&&actions.has(parsed.intent))intent=parsed.intent;
 }catch{return false;}
 if(intent==="none")return false;
 if(!target){await ctx.reply("Elegí primero el grupo con *.destino poner*.");return true;}
 if(intent==="list_signup"){await ctx.reply(await manageEventSignup(target.jid,"status"));return true;}
 if(intent==="close_signup"||intent==="open_signup"){
  await ctx.reply(await manageEventSignup(target.jid,intent==="close_signup"?"close":"open"));return true;
 }
 if(intent==="delete_event"){
  // Reuse the director's explicit confirmation flow; never delete directly from model output.
  return privateDirector({...ctx,text:"borrá la dinámica"});
 }
 if(intent==="publish"||intent==="publish_signup"){
  const canonical=intent==="publish_signup"?"publicalo y toma id":"publicalo";
  return privateDirector({...ctx,text:canonical});
 }
 return false;
}
