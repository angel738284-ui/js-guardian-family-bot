import { command } from "../core/command.ts";
import { sendText } from "../bot/client.ts";
import { getLogGroupJid } from "../features/logGroup.ts";
import { getGroup, isBotAdmin } from "../features/groups.ts";
import { mentionTag, normalizeId } from "../lib/jid.ts";
import { domainFromInput } from "../features/jsGuardianLogic.ts";
import { guardianBan, guardianLog, guardianUnban, guardianWarn } from "../features/jsGuardian.ts";
import {
  getGuardianConfig, guardianWarnings, recentGuardianAudit, setGuardianConfig
} from "../features/jsGuardianStore.ts";

command({
  name: "banjs", description: "Banear del grupo permanentemente", category: "group",
  usage: "@usuario o responder mensaje", permission: "owner", adminOnly: true, botAdmin: true, audit: true,
  run: async (ctx) => {
    const target = ctx.target();
    if (!target) return ctx.replyFail("Mencioná al usuario o respondé su mensaje con /ban.");
    try {
      const result = await guardianBan(ctx.chat, target, normalizeId(ctx.sender));
      await ctx.replyOk(result.removed
        ? `🚫 ${mentionTag(target)} fue expulsado y agregado a la lista negra.`
        : `🚫 ${mentionTag(target)} agregado a la lista negra. No pude expulsarlo ahora (puede que ya no esté en el grupo).`, { mentions: [target] });
    } catch (e) { await ctx.replyFail((e as Error).message); }
  },
});
command({
  name: "desbanjs", description: "Retirar al usuario de la lista negra", category: "group",
  usage: "@usuario o número", permission: "owner", adminOnly: true, audit: true,
  run: async (ctx) => {
    const target = ctx.target() ?? (ctx.args.match(/\d{7,15}/)?.[0] ?? null);
    if (!target) return ctx.replyFail("Usá /desban @usuario o /desban 549XXXXXXXXXX.");
    try {
      await guardianUnban(ctx.chat, target, normalizeId(ctx.sender));
      await ctx.replyOk("✅ Usuario quitado de la lista negra (si se usó un alias distinto, desbanealo también).");
    } catch (e) { await ctx.replyFail((e as Error).message); }
  },
});
command({
  name: "permitirlink", description: "Agregar dominio permitido", category: "group",
  permission: "owner", adminOnly: true, usage: "<dominio o URL>",
  run: async (ctx) => {
    const host = domainFromInput(ctx.args);
    if (!host) return ctx.replyFail("Ejemplo: /permitirlink torneos.example.com");
    const cfg = await getGuardianConfig(ctx.chat);
    cfg.allowedDomains = [...new Set([...cfg.allowedDomains, host])].sort();
    await setGuardianConfig(ctx.chat, cfg);
    await guardianLog({group_id:ctx.chat,action:"DOMINIO PERMITIDO",actor_id:normalizeId(ctx.sender),details:host});
    await ctx.replyOk(`Ahora se permiten enlaces de *${host}* y sus subdominios.`);
  },
});
command({
  name: "quitarlink", description: "Quitar dominio permitido", category: "group",
  permission: "owner", adminOnly: true, usage: "<dominio o URL>",
  run: async (ctx) => {
    const host = domainFromInput(ctx.args);
    if (!host) return ctx.replyFail("Ejemplo: /quitarlink torneos.example.com");
    const cfg = await getGuardianConfig(ctx.chat);
    cfg.allowedDomains = cfg.allowedDomains.filter(x => x !== host);
    await setGuardianConfig(ctx.chat, cfg);
    await guardianLog({group_id:ctx.chat,action:"DOMINIO REVOCADO",actor_id:normalizeId(ctx.sender),details:host});
    await ctx.replyOk(`Quité *${host}* de los enlaces permitidos.`);
  },
});
command({
  name:"linksjs", description:"Ver dominios permitidos", category:"group", permission:"owner", adminOnly:true,
  run:async(ctx)=>{
    const cfg = await getGuardianConfig(ctx.chat);
    await ctx.reply(`🔗 Antilinks: ${cfg.antiLink ? "ACTIVO" : "APAGADO"}\nPermitidos: ${cfg.allowedDomains.length ? cfg.allowedDomains.join(", ") : "ninguno"}`);
  },
});
command({
  name: "guardian", description:"Configurar antistickers y antilinks", category:"group",
  permission:"owner",adminOnly:true,usage:"stickers on|off / links on|off",
  run:async(ctx)=>{
    const cfg=await getGuardianConfig(ctx.chat);
    const [feature, state] = ctx.args.toLowerCase().trim().split(/\s+/);
    if ((feature !== "stickers" && feature !== "links") || (state !== "on" && state !== "off")) {
      return ctx.reply(`🛡️ *JS Guardian*\nAntistickers: ${cfg.antiSticker ? "ACTIVO" : "APAGADO"} (máximo 2/minuto)\nAntilinks: ${cfg.antiLink ? "ACTIVO" : "APAGADO"}\nUsá /guardian stickers on|off o /guardian links on|off.`);
    }
    if(feature==="stickers") cfg.antiSticker=state==="on";
    else cfg.antiLink=state==="on";
    await setGuardianConfig(ctx.chat,cfg);
    await guardianLog({group_id:ctx.chat,action:"CONFIGURACIÓN",actor_id:normalizeId(ctx.sender),details:`${feature} ${state}`});
    await ctx.replyOk(`${feature}: ${state==="on"?"ACTIVO":"APAGADO"}.`);
  },
});
command({
  name:"sanciones",description:"Ver últimas 10 sanciones de este grupo",category:"group",
  permission:"owner",adminOnly:true,
  run:async(ctx)=>{
    const list=await recentGuardianAudit(ctx.chat);
    const message = list.length
      ? "📋 *Últimas sanciones JS*\n"+list.map(a=>`• ${a.created_at.slice(0,16)} — ${a.action} | ${a.target_id??"-"}`).join("\n")
      : "Sin sanciones registradas todavía.";
    await sendText(getLogGroupJid() ?? ctx.sender, message);
    await ctx.replyOk("El historial se envió al chat privado de administración.");
  },
});
command({
  name:"menujs",description:"Menú de control de JS Guardian",category:"group",
  permission:"owner",adminOnly:true,
  run:async(ctx)=>ctx.reply(
    "👑 *JS GUARDIAN · JS FAMILY*\n"+
    "/reglas — Reglas del grupo\n"+
    "/kick @usuario — Expulsar\n"+
    "/warn @usuario — Advertir (3 = expulsión)\n"+
    "/unwarn @usuario — Reiniciar advertencias\n"+
    "/warnings @usuario — Consultar advertencias\n"+
    "/ban @usuario — Ban permanente\n"+
    "/desban @usuario — Quitar ban\n"+
    "/guardian — Ver protecciones\n"+
    "/guardian stickers on|off\n"+
    "/guardian links on|off\n"+
    "/permitirlink dominio.com\n"+
    "/quitarlink dominio.com\n"+
    "/links — Ver excepciones\n"+
    "/promo ID — Revisar promos del ID (solo administrador)\n"+
    "/precios o .precios — Lista de precios con y sin promo\n"+
    "💎 *Compras Epinby (solo JS, privado o grupo):*\n"+
    "/catalogoepin — Productos disponibles y costo USD\n"+
    "/saldoepinby — Saldo del proveedor\n"+
    "/cargar ID 110 — Preparar compra sin pagar\n"+
    "/confirmarcarga — Comprar con confirmación\n"+
    "/cancelarcarga — Descartar pedido preparado\n"+
    "/estadocarga — Estado del último pedido\n"+
    "/adminscomandos on|off — Comandos básicos para administradores\n"+
    "/kie — Estado de la IA GPT-6 Luna\n"+
    "/kie on|off — Activar o apagar IA en este chat\n"+
    "/caracter 0|1|2|3 — Ajustar estilo del bot\n"+
    "/recordame texto — Guardar tu apodo o gusto\n"+
    "/recuerdos — Consultar tus recuerdos\n"+
    "/olvidame — Eliminar tus recuerdos\n"+
    "/sanciones — Ver historial"),
});
