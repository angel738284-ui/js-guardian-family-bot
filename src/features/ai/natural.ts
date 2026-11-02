import type { Ctx } from "../../core/context.ts";
import { kv } from "../../db/kv.ts";
import { isOwner } from "../access.ts";
import { isJSLeader } from "./leaderIdentity.ts";

export type NaturalMode="off"|"tranquilo"|"equilibrado"|"picante";
const key=(chat:string)=>"js:ai:natural:"+chat;
export async function naturalMode(chat:string):Promise<NaturalMode>{
 const value=await kv.get<NaturalMode>(key(chat));
 return value==="off"||value==="tranquilo"||value==="equilibrado"||value==="picante"?value:"tranquilo";
}
export async function naturalCommand(ctx:Ctx):Promise<boolean>{
 const match=ctx.text.trim().match(/^\.natural(?:\s+(off|tranquilo|equilibrado|picante|estado))?$/i);
 if(!match)return false;
 if(!isOwner(ctx)&&!isJSLeader(ctx)){await ctx.reply("Solo JS puede configurar mi personalidad.");return true;}
 const action=(match[1]??"estado").toLowerCase();
 if(action!=="estado")await kv.set(key(ctx.chat),action as NaturalMode);
 const mode=await naturalMode(ctx.chat);
 await ctx.reply("🗣️ *Modo natural:* "+mode+"\nCambiá con .natural tranquilo, .natural equilibrado, .natural picante o .natural off.");
 return true;
}
export function naturalInstructions(mode:NaturalMode,context:string):string{
 if(mode==="off")return "";
 const calm=/\b(triste|mal|deprimid|falleci|murio|problema|ayuda|preocup|ansiedad|enfermo|accidente|perdi a|me duele)\b/i.test(context.normalize("NFD").replace(/[\u0300-\u036f]/g,""));
 return [
 "MODO NATURAL "+mode+": En conversación casual actuá como un compañero de chat argentino: respondé directamente, sin títulos, enumeraciones, saludos automáticos ni cerrar siempre con una pregunta.",
 "Variá la longitud de forma orgánica: a veces una reacción de 2 a 8 palabras, a veces una oración o dos; explicaciones largas solo si la pregunta lo requiere. No repitas frases ni emojis.",
 "Podés reaccionar con humor suave, sorpresa o desacuerdo sincero. No le des siempre la razón al usuario. Tené preferencias conversacionales sobre estrategias de Free Fire, pero reconocé que son opiniones, no experiencias vividas.",
 "Retomá un tema pendiente solo cuando el interlocutor lo mencione o el contexto reciente lo justifique; no inventes conversaciones ni recuerdos.",
 "No te hagas pasar por una persona humana: si te preguntan qué sos, contestá con naturalidad y verdad.",
 calm?"El interlocutor podría estar pasando un mal momento: priorizá empatía y claridad, sin bromas ni insultos.":mode==="tranquilo"?"Tono tranquilo: argentino cálido, bromas muy suaves, pocas puteadas y nada de descansar a desconocidos.":mode==="equilibrado"?"Tono equilibrado: humor amistoso ocasional y chicanas solo con confianza.":"Tono picante: sarcasmo amistoso cuando es recíproco, sin ataques personales ni hostigamiento."
 ].join(" ");
}
