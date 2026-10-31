import type { Ctx } from "../core/context.ts";
import { kv } from "../db/kv.ts";
import { sendText, send } from "../bot/client.ts";
import { aiBrainConfigured, classifyWithKie, type ModerationVerdict } from "./brainAi.ts";
import { isJSLeader } from "./ai/leaderIdentity.ts";
import { isPrivileged } from "./access.ts";
import { getGroup, isBotAdmin, isGroupAdmin } from "./groups.ts";
import { guardianLog, guardianWarn, reportModerationEvidence } from "./jsGuardian.ts";
import { getLogGroupJid } from "./logGroup.ts";
import { mentionTag, normalizeId } from "../lib/jid.ts";
import { logger } from "../lib/logger.ts";
import { classifyGroupMessage, classifyContextualReply, isIsolatedRudeWord, isAggressiveRudePhrase } from "./brainLogic.ts";

export type BrainMode = "suave"|"firme";
export interface BrainSettings {enabled:boolean;mode:BrainMode;ai:boolean;autoDelete:boolean}
interface Offenses {count:number;lastAt:number}
const DAY=24*60*60_000;
const USER_COOLDOWN=90_000;
const MAX_GROUP_PER_HOUR=12;
const intervalBySender=new Map<string,number>();
const profanityBySender=new Map<string,{first:number;count:number}>();
const rateByGroup=new Map<string,{start:number;count:number}>();
const settingsKey=(chat:string)=>"js:brain:settings:"+chat;
const offensesKey=(chat:string,sender:string)=>"js:brain:offenses:"+chat+":"+sender;
// Diagnóstico de flujo sin almacenar ni registrar textos o números de usuarios.
interface BrainDiagnostics {lastAt:number; stages:Record<string,number>}
const brainDiagnostics=new Map<string,BrainDiagnostics>();
export function brainStage(group:string,stage:string):void {
  const current=brainDiagnostics.get(group)??{lastAt:0,stages:{}};
  current.lastAt=Date.now();
  current.stages[stage]=(current.stages[stage]??0)+1;
  brainDiagnostics.set(group,current);
  if(brainDiagnostics.size>150)brainDiagnostics.delete(brainDiagnostics.keys().next().value!);
}
export function getBrainDiagnostics(group:string):BrainDiagnostics|null {
  return brainDiagnostics.get(group)??null;
}


export function actionForBrain(
  local:"attack"|"profanity"|"threat"|null,
  ai:ModerationVerdict|null,
):{kind:"attack"|"profanity"|"threat"|null;shouldDelete:boolean} {
  if(ai && ai.confidence>=0.76){
    if(ai.level==="severe")return {kind:"threat",shouldDelete:ai.confidence>=0.94};
    if(ai.level==="attack")return {kind:"attack",shouldDelete:false};
    if(ai.level==="rude")return {kind:"profanity",shouldDelete:false};
    if(ai.level==="safe" && ai.confidence>=0.89)return {kind:null,shouldDelete:false};
  }
  return {kind:local,shouldDelete:false};
}

export async function deleteSevereMessage(ctx:Ctx,canDelete:boolean):Promise<boolean> {
  if(!canDelete || !ctx.event.key?.id || ctx.event.key.fromMe)return false;
  // Nunca borrar un mensaje viejo o cuya clave no corresponde al grupo actual.
  if(ctx.event.key.remoteJid!==ctx.chat)return false;
  const age=Date.now()/1000-(ctx.event.timestampSeconds??0);
  if(age<0 || age>120)return false;
  try {await send(ctx.chat,{type:"revoke",target:ctx.event});return true}
  catch(err){logger.warn("No se pudo borrar mensaje grave: "+(err instanceof Error?err.message:String(err)));return false}
}

export async function brainSettings(chat:string):Promise<BrainSettings> {
  const s=await kv.get<Partial<BrainSettings>>(settingsKey(chat));
  return {enabled:s?.enabled===true,mode:s?.mode==="suave"?"suave":"firme",
    ai:s?.ai!==false,autoDelete:s?.autoDelete!==false};
}
export async function setBrainSettings(chat:string,s:BrainSettings):Promise<void> {
  if(s.mode!=="suave"&&s.mode!=="firme")throw new Error("Modo de moderación inválido.");
  await kv.set(settingsKey(chat),s);
}
function canReply(chat:string,sender:string,now:number):boolean {
  if(now-(intervalBySender.get(chat+"|"+sender)??0)<USER_COOLDOWN)return false;
  const previous=rateByGroup.get(chat);
  const group=previous&&now-previous.start<60*60_000?previous:{start:now,count:0};
  if(group.count>=MAX_GROUP_PER_HOUR)return false;
  intervalBySender.set(chat+"|"+sender,now);
  group.count++;
  rateByGroup.set(chat,group);
  if(intervalBySender.size>1500)intervalBySender.delete(intervalBySender.keys().next().value!);
  if(rateByGroup.size>200)rateByGroup.delete(rateByGroup.keys().next().value!);
  return true;
}

/** Regresa true si reaccionó. No entrega permisos a otros usuarios.
 *  Las infracciones y los ajustes sobreviven reinicios mediante KV persistente. */
export async function runBrainGuard(ctx:Ctx):Promise<boolean> {
  if(!ctx.isGroup||ctx.fromMe||ctx.chat===getLogGroupJid()||ctx.message.type!=="text"||
    ctx.command||isJSLeader(ctx))return false;
  // "tarado" sin contexto puede ser una broma; al responder a alguien sí
  // tiene destinatario. Nunca inferirlo desde el mensaje citado por sí solo.
  brainStage(ctx.chat,"analizado");
  const quotedSender=ctx.message.quoted?.sender;
  const quotedOther=Boolean(quotedSender && !ctx.senderIds.some(id=>normalizeId(id)===normalizeId(quotedSender)));
  const mentionedOther=ctx.message.mentions.some(id=>!ctx.senderIds.some(own=>normalizeId(own)===normalizeId(id)));
  const directed=quotedOther||mentionedOther;
  // Citar a otra persona convierte una palabra aislada como "puto" en un ataque dirigido.
  const local=(isIsolatedRudeWord(ctx.text) && directed)
    ? (classifyContextualReply(ctx.text,true)??"attack")
    : (classifyGroupMessage(ctx.text) ?? classifyContextualReply(ctx.text,directed));
  try {
    const settings=await brainSettings(ctx.chat);
    if(!settings.enabled){brainStage(ctx.chat,"desactivado");return false;}
    const metadata=await getGroup(ctx.chat).catch(()=>null);
    if(!metadata){brainStage(ctx.chat,"sin_metadatos");return false;}
    if(await isPrivileged(ctx)){brainStage(ctx.chat,"exento");return false;}
    const aiVerdict=settings.ai&&aiBrainConfigured()
      ? await classifyWithKie(ctx.text,ctx.chat,{
          isReply:directed,isMention:mentionedOther,
          quotedText:ctx.message.quoted?.text,
        }) : null;
    let {kind:finding,shouldDelete}=actionForBrain(local,aiVerdict);
    // Frente a frases manifiestamente agresivas, una clasificación remota
    // "safe" no silencia la advertencia local. Nunca borra por esta excepción.
    if(!finding && isAggressiveRudePhrase(ctx.text)){
      finding="profanity";
      brainStage(ctx.chat,"frase_agresiva_local");
    }
    if(!finding){brainStage(ctx.chat,"sin_infraccion");return false;}
    const canDelete=isBotAdmin(metadata);
    if(settings.mode==="firme" && settings.autoDelete && shouldDelete && canDelete){
      await reportModerationEvidence(ctx, "Mensaje grave detectado por IA, pendiente de eliminación");
      const removed=await deleteSevereMessage(ctx,canDelete);
      if(removed){
        const sender=normalizeId(ctx.sender);
        brainStage(ctx.chat,"mensaje_borrado");
        await guardianLog({group_id:ctx.chat,action:"CEREBRO ELIMINÓ MENSAJE GRAVE",actor_id:"JS_CEREBRO",target_id:sender,details:"Infracción grave confirmada por IA (sin texto original)"});
        await sendText(ctx.chat,"🧹 Mensaje grave eliminado. Che, acá nos tratamos con respeto.").catch(()=>{});
        return true;
      }
    }
    const senderIsAdmin=isGroupAdmin(metadata,ctx.senderIds);
    const sender=normalizeId(ctx.sender);
    const now=Date.now();
    if(finding==="profanity") {
      const pKey=ctx.chat+"|"+sender;
      const before=profanityBySender.get(pKey);
      const p=before&&now-before.first<10*60_000?before:{first:now,count:0};
      p.count++;
      profanityBySender.set(pKey,p);
      if(profanityBySender.size>1200)profanityBySender.delete(profanityBySender.keys().next().value!);
      // Una grosería fuerte aislada recibe una corrección suave al instante;
      // lenguaje coloquial dentro de una charla necesita repetición.
      if(!isIsolatedRudeWord(ctx.text) && !isAggressiveRudePhrase(ctx.text) && p.count<3){brainStage(ctx.chat,"esperando_reincidencia");return false;}
      profanityBySender.delete(pKey);
    }
    if(!canReply(ctx.chat,sender,now)){brainStage(ctx.chat,"pausa_anti_spam");return false;}
    const tag=mentionTag(ctx.sender);
    if(finding==="profanity"){
      await sendText(ctx.chat,`🧹 Che ${tag}, cuidemos el lenguaje, ¿sí? Acá se puede bromear sin faltar el respeto. 😌`,[ctx.sender]);
      brainStage(ctx.chat,"recordatorio");
      await reportModerationEvidence(ctx, "Lenguaje grosero (recordatorio, sin sanción)");
      await guardianLog({group_id:ctx.chat,action:"CEREBRO RECORDATORIO",actor_id:"JS_CEREBRO",target_id:sender,details:"Lenguaje grosero, sin sanción"});
      return true;
    }
    const key=offensesKey(ctx.chat,sender);
    const stored=await kv.get<Offenses>(key);
    const count=(stored&&now-stored.lastAt<DAY?stored.count:0)+1;
    await kv.set(key,{count,lastAt:now});
    const threat=finding==="threat";
    const intro=threat
      ? "🧹 Che, acá no van las amenazas. Bajá un cambio y respetá a los demás."
      : "🧹 Pará un poquito, corazón. Acá se puede joder, pero no bardear a otra persona. Respetá.";
    // Modo suave = recordatorios, nunca sanciona; firme = escala SOLO ataques
    // claros y repetidos. Una amenaza directa se advierte desde la primera vez.
    // Los administradores también reciben recordatorios, pero no sanciones
    // automáticas; una sanción de admin requiere decisión humana.
    if(senderIsAdmin || settings.mode==="suave" || (!threat&&count===1) || !isBotAdmin(metadata)){
      await sendText(ctx.chat,`${intro} ${tag}`,[ctx.sender]);
      brainStage(ctx.chat,"intervencion");
      await reportModerationEvidence(ctx, "Intervención por " + finding);
      await guardianLog({group_id:ctx.chat,action:"CEREBRO INTERVENCIÓN",actor_id:"JS_CEREBRO",target_id:sender,details:`${finding}, episodio ${count}, modo ${settings.mode}`});
      return true;
    }
    brainStage(ctx.chat,"advertencia");
    await reportModerationEvidence(ctx, "Advertencia por " + finding);
    await guardianWarn(ctx.chat,"JS_CEREBRO",ctx.sender,ctx.senderIds,intro);
    return true;
  }catch(err){
    brainStage(ctx.chat,"error");
    logger.warn("Moderación cerebral: "+(err instanceof Error?err.message:String(err)));
    return false;
  }
}
