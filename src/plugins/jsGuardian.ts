import { command } from "../core/command.ts";
import { kv } from "../db/kv.ts";
import { sendText } from "../bot/client.ts";
import { getLogGroupJid } from "../features/logGroup.ts";
import { getGroup, isBotAdmin } from "../features/groups.ts";
import { mentionTag, normalizeId } from "../lib/jid.ts";
import { domainFromInput } from "../features/jsGuardianLogic.ts";
import { guardianBan, guardianLog, guardianUnban, guardianWarn } from "../features/jsGuardian.ts";
import {
  getGuardianConfig, guardianWarnings, recentGuardianAudit, setGuardianConfig, listGuardianStateScope, setBannedAliases
} from "../features/jsGuardianStore.ts";

command({
  name: "privados", description: "Activar o desactivar respuestas por privado", category: "owner",
  permission: "owner", usage: "off|on|estado", audit: true,
  run: async (ctx) => {
    const action=ctx.args.trim().toLowerCase();
    if(action==="off"){await kv.set("js_private_replies_disabled",true);await ctx.replyOk("🔕 No responderé mensajes privados de otras personas. Los códigos privados de JS Torneos se siguen enviando.");return;}
    if(action==="on"){await kv.set("js_private_replies_disabled",false);await ctx.replyOk("🔔 Volví a responder mensajes privados.");return;}
    if(action===""||action==="estado"){const off=await kv.get<boolean>("js_private_replies_disabled");await ctx.reply("📩 Respuestas privadas: "+(off?"DESACTIVADAS":"ACTIVADAS")+"\nUsá /privados off o /privados on.");return;}
    await ctx.replyFail("Usá /privados off, /privados on o /privados estado.");
  },
});

const pendingUnbans = new Map<string,{expires:number;aliases:string[][]}>();

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
    if (ctx.args.trim().toLowerCase() === "lista") {
      const rows = await listGuardianStateScope(`ban:${ctx.chat}`);
      const entries = new Map<string,string[]>();
      for (const row of rows) {
        const aliases = Array.isArray(row.value.aliases) ? row.value.aliases.filter((x):x is string=>typeof x==="string") : [row.item];
        const key = [...aliases].sort().join("|");
        if (!entries.has(key)) entries.set(key,aliases);
      }
      const choices = [...entries.values()].sort((a,b)=>a[0]!.localeCompare(b[0]!)).slice(0,25);
      const lines = choices.map((aliases,i)=>`${i+1}. ${aliases.join(" / ")}`);
      pendingUnbans.set(ctx.chat+"|"+normalizeId(ctx.sender),{expires:Date.now()+10*60_000,aliases:choices});
      await sendText(ctx.sender,lines.length ? `🔒 *Lista de bloqueados*\n${lines.join("\n")}\n\nElegí una opción y escribí /desban 1 (o el número de la opción) en el grupo, dentro de 10 minutos. Revisá los identificadores antes de elegir.` : "No hay usuarios en la lista negra de este grupo.");
      await ctx.replyOk("Te envié la lista de bloqueados por privado.");
      return;
    }
    const selection = ctx.args.trim();
    if (/^\d{1,2}$/.test(selection)) {
      const key = ctx.chat+"|"+normalizeId(ctx.sender);
      const pending = pendingUnbans.get(key);
      const aliases = pending?.expires && pending.expires>Date.now() ? pending.aliases[Number(selection)-1] : undefined;
      if (!aliases) return ctx.replyFail("La opción no existe o venció. Escribí /desban lista nuevamente.");
      const current = await listGuardianStateScope(`ban:${ctx.chat}`);
      if (!aliases.some(id=>current.some(row=>row.item===id))) return ctx.replyFail("Ese bloqueo ya no existe. Actualizá /desban lista.");
      await setBannedAliases(ctx.chat,aliases,false);
      pendingUnbans.delete(key);
      await guardianLog({group_id:ctx.chat,action:"DESBAN DESDE LISTA",actor_id:normalizeId(ctx.sender),target_id:aliases.join(",")});
      await ctx.replyOk("🔓 Bloqueo eliminado para los identificadores de la opción "+selection+". Ya podés volver a invitarlo.");
      return;
    }
    const target = ctx.target() ?? (ctx.args.match(/\d{7,20}/)?.[0] ?? null);
    if (!target) return ctx.replyFail("Usá /desban @usuario, /desban NUMERO o /desban lista.");
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
    if ((feature !== "stickers" && feature !== "links" && feature !== "contenido") || (state !== "on" && state !== "off")) {
      return ctx.reply(`🛡️ *JS Guardian*\nAntistickers: ${cfg.antiSticker ? "ACTIVO" : "APAGADO"} (máximo 2/minuto)\nAntilinks: ${cfg.antiLink ? "ACTIVO" : "APAGADO"}\nDetector explícito: ${cfg.antiExplicitSticker ? "ACTIVO" : "APAGADO"}\nUsá /guardian contenido on|off, /guardian stickers on|off o /guardian links on|off.`);
    }
    if(feature==="stickers") cfg.antiSticker=state==="on";
    else if(feature==="contenido") cfg.antiExplicitSticker=state==="on";
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
    "/cerebro on|off — Moderación activa en este grupo\n"+
    "/cerebro modo suave|firme — Sanciones graduales\n"+
    "/guardian stickers on|off\n"+
    "/guardian links on|off\n"+
    "/permitirlink dominio.com\n"+
    "/quitarlink dominio.com\n"+
    "/links — Ver excepciones\n"+
    "/promo ID — Revisar promos del ID (solo administrador)\n"+
    "/precios o .precios — Lista de precios con y sin promo\n"+
    ".torneos o /torneos — Torneos JS con inscripciones abiertas\n"+
    "💎 *Recargas JS (solo JS):*\n"+
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
