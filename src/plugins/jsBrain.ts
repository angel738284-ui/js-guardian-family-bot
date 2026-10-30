import { command } from "../core/command.ts";
import { isJSLeader } from "../features/ai/leaderIdentity.ts";
import { brainSettings,setBrainSettings } from "../features/brainGuard.ts";
import { classifyGroupMessage, isIsolatedRudeWord } from "../features/brainLogic.ts";
import { isBotAdmin } from "../features/groups.ts";
import { aiBrainConfigured, classifyWithKie } from "../features/brainAi.ts";
import { actionForBrain } from "../features/brainGuard.ts";

command({
  name:"cerebro",description:"Moderación automática del grupo: lenguaje, insultos y sanciones progresivas",
  category:"owner",permission:"owner",groupOnly:true,
  usage:"on|off|ia on|ia off|borrar on|borrar off|modo suave|modo firme",
  run:async(ctx)=>{
    if(!isJSLeader(ctx))return;
    const args=ctx.args.trim().toLowerCase();
    const s=await brainSettings(ctx.chat);
    if(args.startsWith("pruebaia ")) {
      const sample=ctx.args.trim().slice(9,250);
      if(!sample) {await ctx.reply("Usá /cerebro pruebaia TEXTO");return;}
      if(!aiBrainConfigured()) {await ctx.reply("⚠️ No está configurada la API de IA.");return;}
      const verdict=await classifyWithKie(sample,ctx.chat,{isReply:false,isMention:false});
      if(!verdict){await ctx.reply("⚠️ No se pudo consultar la IA (límite de uso o servicio no disponible). No se sancionó a nadie.");return;}
      const action=actionForBrain(classifyGroupMessage(sample),verdict);
      const labels={safe:"Permitido",rude:"Grosería",attack:"Insulto dirigido",severe:"Infracción grave"};
      await ctx.reply("🧠 *Resultado de la IA (sin sanción)*\n"+
        "Clasificación: "+labels[verdict.level]+"\n"+
        "Confianza: "+Math.round(verdict.confidence*100)+"%\n"+
        "Borrado propuesto: "+(action.shouldDelete?"SÍ (requiere bot administrador y borrado activo)":"No")+"\n"+
        "Esta prueba no elimina mensajes.");
      return;
    }
    if(args==="ia on"||args==="ia off"){
      s.ai=args==="ia on";
      await setBrainSettings(ctx.chat,s);
      await ctx.replyOk("🧠 Análisis con IA *"+(s.ai?"ACTIVO":"DESACTIVADO")+"* en este grupo. "+
        (s.ai?"Utiliza créditos de Kie y analiza texto de integrantes.":"Solo quedan las reglas locales."));
      return;
    }
    if(args==="borrar on"||args==="borrar off"){
      s.autoDelete=args==="borrar on";
      await setBrainSettings(ctx.chat,s);
      await ctx.replyOk("🧹 Borrado automático de infracciones graves *"+(s.autoDelete?"ACTIVO":"DESACTIVADO")+"*.");
      return;
    }
    if(args.startsWith("prueba ")) {
      const sample=ctx.args.trim().slice(7,150);
      const finding=classifyGroupMessage(sample);
      const isolated=isIsolatedRudeWord(sample);
      const group=await ctx.group();
      const status=!finding?"Sin infracción explícita":
        finding==="attack"?"Insulto dirigido":finding==="threat"?"Amenaza":
        isolated?"Grosería aislada: recordatorio inmediato, sin sanción":
        "Lenguaje fuerte: intervenir si se repite";
      await ctx.reply("🧠 *Prueba del cerebro (no sanciona)*\n"+
        "Estado del grupo: "+(s.enabled?"ACTIVO":"APAGADO")+" · "+s.mode+"\n"+
      "IA: "+(s.ai?"ACTIVA":"APAGADA")+" · Borrado: "+(s.autoDelete?"SÍ":"NO")+"\n"+
        "Bot administrador: "+(isBotAdmin(group)?"Sí":"No")+"\n"+
        "Texto: "+sample.replace(/[\r\n*_]/g," ")+"\n"+
        "Resultado: "+status);
      return;
    }
    if(args==="on"||args==="off"){
      s.enabled=args==="on";
      await setBrainSettings(ctx.chat,s);
      await ctx.replyOk("🧠 Cerebro moderador *"+(s.enabled?"ACTIVO":"APAGADO")+"* en este grupo. Modo: *"+s.mode+"*.");
      return;
    }
    if(args==="modo suave"||args==="modo firme"){
      s.mode=args.endsWith("suave")?"suave":"firme";
      await setBrainSettings(ctx.chat,s);
      await ctx.replyOk("🧠 Modo: *"+s.mode+"*."+
        (s.mode==="firme"?" Primero pide respeto y después advierte. A las 3 advertencias, expulsa si el bot es administrador.":
        " Solo hace recordatorios, sin expulsiones."));
      return;
    }
    await ctx.reply(
      "🧠 *CEREBRO DE JS GUARDIAN*\n"+
      "Estado: *"+(s.enabled?"ACTIVO":"APAGADO")+"*\nModo: *"+s.mode+"*\nIA: *"+(s.ai?"ACTIVA":"APAGADA")+"*\nBorrado grave: *"+(s.autoDelete?"ACTIVO":"APAGADO")+"*\n\n"+
      "🧹 Detecta insultos directos, amenazas y lenguaje fuerte.\n"+
      "💬 No sanciona una mala palabra suelta ni una primera cargada.\n"+
      "⚠️ Modo firme: ante ataques repetidos, advertencias; con 3 advertencias expulsa (si el bot es admin).\n"+
      "🔒 Nunca da permisos de compra a otros miembros.\n\n"+
      "*/cerebro on* — Activar en este grupo\n"+
      "*/cerebro off* — Desactivar\n"+
      "*/cerebro modo suave* — Solo intervenir\n"+
      "*/cerebro modo firme* — Sanciones graduales\n"+
      "*/cerebro ia on|off* — Análisis con Kie (consume créditos)\n"+
      "*/cerebro borrar on|off* — Eliminar mensajes muy graves\n"+
      "*/cerebro prueba TEXTO* — Prueba de reglas sin sancionar\n"+
      "*/cerebro pruebaia TEXTO* — Prueba con IA sin sancionar\n\n"+
      "Analiza únicamente texto. IA y borrado pueden tardar unos segundos y no garantizan detectar todos los casos."
    );
  },
});
