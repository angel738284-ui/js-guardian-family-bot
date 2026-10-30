import type { Ctx } from "../core/context.ts";
import { kv } from "../db/kv.ts";
import { sendText } from "../bot/client.ts";
import { isJSLeader } from "./ai/leaderIdentity.ts";
import { isPrivileged } from "./access.ts";
import { getGroup, isBotAdmin, isGroupAdmin } from "./groups.ts";
import { guardianLog, guardianWarn } from "./jsGuardian.ts";
import { getLogGroupJid } from "./logGroup.ts";
import { mentionTag, normalizeId } from "../lib/jid.ts";
import { logger } from "../lib/logger.ts";
import { classifyGroupMessage } from "./brainLogic.ts";

export type BrainMode = "suave"|"firme";
export interface BrainSettings {enabled:boolean;mode:BrainMode}
interface Offenses {count:number;lastAt:number}
const DAY=24*60*60_000;
const USER_COOLDOWN=90_000;
const MAX_GROUP_PER_HOUR=12;
const intervalBySender=new Map<string,number>();
const profanityBySender=new Map<string,{first:number;count:number}>();
const rateByGroup=new Map<string,{start:number;count:number}>();
const settingsKey=(chat:string)=>"js:brain:settings:"+chat;
const offensesKey=(chat:string,sender:string)=>"js:brain:offenses:"+chat+":"+sender;

export async function brainSettings(chat:string):Promise<BrainSettings> {
  const s=await kv.get<Partial<BrainSettings>>(settingsKey(chat));
  return {enabled:s?.enabled===true,mode:s?.mode==="suave"?"suave":"firme"};
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
  const finding=classifyGroupMessage(ctx.text);
  if(!finding)return false;
  try {
    const settings=await brainSettings(ctx.chat);
    if(!settings.enabled)return false;
    const metadata=await getGroup(ctx.chat).catch(()=>null);
    if(!metadata||isGroupAdmin(metadata,ctx.senderIds)||await isPrivileged(ctx))return false;
    const sender=normalizeId(ctx.sender);
    const now=Date.now();
    if(finding==="profanity") {
      const pKey=ctx.chat+"|"+sender;
      const before=profanityBySender.get(pKey);
      const p=before&&now-before.first<10*60_000?before:{first:now,count:0};
      p.count++;
      profanityBySender.set(pKey,p);
      if(profanityBySender.size>1200)profanityBySender.delete(profanityBySender.keys().next().value!);
      // Lenguaje coloquial en Argentina: 1 o 2 malas palabras NO generan intervención.
      if(p.count<3)return false;
      profanityBySender.delete(pKey);
    }
    if(!canReply(ctx.chat,sender,now))return false;
    const tag=mentionTag(ctx.sender);
    if(finding==="profanity"){
      await sendText(ctx.chat,`🧹 Che ${tag}, bajemos un cambio con las malas palabras, ¿sí? Que el grupo esté tranquilo. 😌`,[ctx.sender]);
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
    if(settings.mode==="suave" || (!threat&&count===1) || !isBotAdmin(metadata)){
      await sendText(ctx.chat,`${intro} ${tag}`,[ctx.sender]);
      await guardianLog({group_id:ctx.chat,action:"CEREBRO INTERVENCIÓN",actor_id:"JS_CEREBRO",target_id:sender,details:`${finding}, episodio ${count}, modo ${settings.mode}`});
      return true;
    }
    await guardianWarn(ctx.chat,"JS_CEREBRO",ctx.sender,ctx.senderIds,intro);
    return true;
  }catch(err){
    logger.warn("Moderación cerebral: "+(err instanceof Error?err.message:String(err)));
    return false;
  }
}
