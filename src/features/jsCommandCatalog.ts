import { config } from "../config.ts";
import { menuCommands, type Category } from "../core/command.ts";
import type { Ctx } from "../core/context.ts";
import { isOwner } from "./access.ts";
import { isJSLeader } from "./ai/leaderIdentity.ts";

const sections: {category:Category;title:string}[]=[
 {category:"system",title:"⚙️ SISTEMA"},
 {category:"group",title:"🛡️ GRUPOS Y MODERACIÓN"},
 {category:"tools",title:"🧰 HERRAMIENTAS"},
 {category:"media",title:"🎬 MULTIMEDIA"},
 {category:"owner",title:"👑 DUEÑO"},
];
const special=[
 "🔒 *GRUPO*",
 "• `.off` — Cerrar el grupo",
 "• `.on` — Abrir el grupo",
 "• `/permiso agregar NÚMERO grupo` — Delegar apertura/cierre",
 "• `/permiso quitar NÚMERO grupo` — Revocar permiso",
 "• `/permiso lista` — Listar autorizados",
 "• `/permiso ver NÚMERO` — Consultar autorización",
 "🏆 *JS TORNEOS*",
 "• `/torneobr 20` — Crear BR Solo (solo JS)",
 "• `/torneobr estado` — Consultar inscritos",
 "• `/torneobr pausar` — Pausar inscripciones",
 "• `/torneobr seguir CÓDIGO` — Reanudar",
 "• `/verificarid ID` — Buscar jugador en torneos",
 "• `/jugadortorneo ID` / `/buscartorneo ID` — Alternativas",
 "• `JS, haz un torneo BR para 20 jugadores` — Crear con frase",
 "🤖 *CEREBRO Y SEGURIDAD*",
 "• `/cerebro on|off` — Moderación",
 "• `/cerebro ia on|off` — Análisis IA",
 "• `/cerebro modo firme|suave` — Nivel",
 "• `/cerebro borrar on|off` — Borrado",
 "• `/guardian stickers on|off` — Antispam de stickers",
 "• `/guardian contenido on|off` — Análisis visual",
 "• `/guardian links on|off` — Antilinks",
 "• `/privados on|off|estado` — Respuestas privadas",
];
export async function sendJsCommands(ctx:Ctx):Promise<boolean>{
 if(!/^\.cmds\s*$/i.test(ctx.text.trim()))return false;
 if(!isOwner(ctx)&&!isJSLeader(ctx)){await ctx.reply("⛔ El catálogo completo es exclusivo del dueño.");return true;}
 const intro="📚 *JS GUARDIAN — TODOS LOS COMANDOS*\nComandos reales registrados + funciones especiales.\nEl prefijo general es `"+config.prefix+"`. Los comandos con / y . se escriben exactamente como aparecen.";
 const blocks=[intro,"✨ *COMANDOS ESPECIALES*\n"+special.join("\n")];
 for(const section of sections){
  const commands=menuCommands().filter(c=>c.category===section.category);
  if(!commands.length)continue;
  const lines=commands.map(c=>{
   const scope=c.permission==="owner"?" 👑":c.adminOnly?" 🔐":"";
   const use=c.usage?" "+c.usage:"";
   return "• `"+config.prefix+c.name+use+"`"+scope+" — "+c.description;
  });
  blocks.push("*"+section.title+"*\n"+lines.join("\n"));
 }
 // Enviar en varias partes para evitar el límite de tamaño de mensajes de WhatsApp.
 for(const block of blocks){
  if(block.length<=3400){await ctx.reply(block);continue;}
  const lines=block.split("\n");let chunk="";
  for(const line of lines){
   if(chunk && (chunk+"\n"+line).length>3200){await ctx.reply(chunk);chunk="";}
   chunk+=(chunk?"\n":"")+line;
  }
  if(chunk)await ctx.reply(chunk);
 }
 return true;
}
