import type { Ctx } from "../../core/context.ts";
import { normalizeId } from "../../lib/jid.ts";
import {
  enableSocialMemory, disableSocialMemory, getSocialMemoryProfile,
  saveSocialMemory, deleteSocialMemoryFact, clearSocialMemoryFacts
} from "./socialMemory.ts";
import { SOCIAL_MEMORY_MAX_FACTS, parseExplicitSocialMemoryRequest, type SocialFactKind } from "./socialMemoryCore.ts";

const HELP = [
  "🧠 *MEMORIA SOCIAL · JS GUARDIAN V3*",
  "Cada jugador decide qué guardar. Sin activarla, no guardo recuerdos nuevos de esta función.",
  "",
  "*.memoria on* — Activar (en este chat)",
  "*.memoria guardar TEXTO* — Recordar un dato de juego",
  "O decime: *Guardian, acordate que prefiero jugar con Nico* (con memoria activada).",
  "*.memoria gusto TEXTO* — Recordar un gusto",
  "*.memoria anecdota TEXTO* — Recordar una anécdota de Free Fire",
  "*.memoria apodo NOMBRE* — Cómo querés que te llame",
  "*.memoria ver* — Ver tus recuerdos",
  "*.memoria borrar 2* — Borrar un dato",
  "*.memoria borrar todo* — Vaciar los datos",
  "*.memoria off* — Desactivar y eliminar esta memoria",
  "",
  "🔒 Solo podés guardar y administrar tus propios datos, en este chat. ",
  "No guardes información personal ni de otras personas. Los recuerdos pueden influir en respuestas visibles en el grupo.",
  "Máximo "+SOCIAL_MEMORY_MAX_FACTS+" recuerdos, con vigencia de 90 días desde que se guardan.",
  "Los comandos antiguos .recordame / .recuerdos / .olvidame siguen siendo independientes."
].join("\n");

const display = (s:string):string => s.replace(/[\r\n*_~`]/g," ").trim();

export async function handleSocialMemoryCommand(ctx:Ctx):Promise<boolean>{
  if(ctx.command!=="memoria")return false;
  const user=normalizeId(ctx.sender);
  if(!user){await ctx.replyFail("No pude identificar a quién pertenece este recuerdo.");return true;}
  const args=ctx.args.trim();
  const match=args.match(/^(\S+)(?:\s+([\s\S]*))?$/);
  const action=(match?.[1]??"ayuda").toLowerCase();
  const value=(match?.[2]??"").trim();

  try {
    if(["ayuda","help","menu"].includes(action)){await ctx.reply(HELP);return true;}
    if(["on","activar"].includes(action)){
      const profile=await enableSocialMemory(ctx.chat,user);
      await ctx.replyOk("🧠 Memoria social activada *en este chat* ("+profile.facts.length+"/"+SOCIAL_MEMORY_MAX_FACTS+"). "+
        "Guardá solo lo que vos elijas con *.memoria guardar TEXTO*. "+
        "Los recuerdos pueden aparecer en respuestas públicas del grupo. Desactivá y borrá con *.memoria off*.");
      return true;
    }
    if(["off","desactivar"].includes(action)){
      await disableSocialMemory(ctx.chat,user);
      await ctx.replyOk("🧹 Memoria social V3 desactivada: borré los datos guardados por esta función en este chat. "+
        "Otros recuerdos previos de *.recordame* se administran con *.olvidame*.");
      return true;
    }
    if(["estado","status"].includes(action)){
      const profile=await getSocialMemoryProfile(ctx.chat,user);
      await ctx.reply("🧠 *Memoria social V3*\nEstado: *"+(profile?"ACTIVA":"APAGADA")+"*"+
        (profile?"\nDatos: "+profile.facts.length+"/"+SOCIAL_MEMORY_MAX_FACTS+"\nVigencia: 90 días por recuerdo":"")+
        "\nPara configurar: *.memoria ayuda*");
      return true;
    }
    if(["ver","lista","recuerdos"].includes(action)){
      const profile=await getSocialMemoryProfile(ctx.chat,user);
      if(!profile){await ctx.reply("Todavía no activaste tu memoria social. Usá *.memoria on*.");return true;}
      const data=profile.facts.map((f,i)=>(i+1)+". ["+f.kind+"] "+display(f.text));
      await ctx.reply("🧠 *Tus recuerdos voluntarios en este chat*\n"+
        (data.length?data.join("\n"):"Todavía no guardaste datos.")+
        "\n\nPara borrar uno: *.memoria borrar N*. "+
        (ctx.isGroup?"⚠️ Esta respuesta es visible para el grupo.":""));
      return true;
    }
    if(["borrar","eliminar"].includes(action)){
      if(value.toLowerCase()==="todo" || value.toLowerCase()==="todos"){
        await clearSocialMemoryFacts(ctx.chat,user);
        await ctx.replyOk("🧹 Borré todos los recuerdos sociales V3 de este chat. La memoria sigue activada.");
        return true;
      }
      if(!/^(?:[1-9]|10)$/.test(value)){
        await ctx.replyFail("Indicá el número del recuerdo, por ejemplo *.memoria borrar 2*, o *.memoria borrar todo*.");
        return true;
      }
      const facts=await deleteSocialMemoryFact(ctx.chat,user,Number(value));
      await ctx.replyOk("🧹 Recuerdo borrado. Ahora tenés "+facts.length+" dato(s).");
      return true;
    }
    const kinds: Record<string,SocialFactKind> = {
      guardar:"dato", dato:"dato", gusto:"gusto", gustos:"gusto",
      anecdota:"anecdota", "anécdota":"anecdota", apodo:"apodo",
    };
    if(Object.hasOwn(kinds,action)){
      if(!value){await ctx.replyFail("Escribí el dato después del comando. Ejemplo: *.memoria gusto juego mucho PvP*.");return true;}
      const facts=await saveSocialMemory(ctx.chat,user,kinds[action]!,value);
      await ctx.replyOk("🧠 Lo anoté en *tu memoria social de este chat* ("+facts.length+"/"+SOCIAL_MEMORY_MAX_FACTS+"). "+
        "Podés verlo con *.memoria ver* o borrarlo cuando quieras.");
      return true;
    }
    await ctx.reply(HELP);
  } catch(error) {
    await ctx.replyFail(error instanceof Error?error.message:"No pude guardar tu recuerdo. Probá otra vez.");
  }
  return true;
}

/** Opt-in conversational memory: "Guardian, acordate que juego con Nico".
 * Requires the speaker's memory to already be enabled. No hidden profiling.
 */
export async function handleExplicitSocialMemoryRequest(ctx:Ctx):Promise<boolean>{
  if(ctx.command || ctx.message.type!=="text" || ctx.fromMe)return false;
  const statement=parseExplicitSocialMemoryRequest(ctx.text);
  if(!statement)return false;
  const user=normalizeId(ctx.sender);
  if(!user)return true;
  try {
    const facts=await saveSocialMemory(ctx.chat,user,"dato",statement);
    await ctx.replyOk("🧠 Me acuerdo, "+(ctx.pushName.slice(0,25)||"crack")+
      ". Lo guardé solo para tu memoria voluntaria de este chat ("+facts.length+"/"+SOCIAL_MEMORY_MAX_FACTS+"). "+
      "Podés borrarlo con *.memoria ver* y *.memoria borrar N*.");
  } catch(error) {
    await ctx.replyFail(error instanceof Error?error.message:"No pude recordar eso.");
  }
  return true;
}
