import { command } from "../core/command.ts";
import { isJSLeader } from "../features/ai/leaderIdentity.ts";
import { brainSettings,setBrainSettings } from "../features/brainGuard.ts";

command({
  name:"cerebro",description:"Moderación automática del grupo: lenguaje, insultos y sanciones progresivas",
  category:"owner",permission:"owner",groupOnly:true,
  usage:"on|off|modo suave|modo firme",
  run:async(ctx)=>{
    if(!isJSLeader(ctx))return;
    const args=ctx.args.trim().toLowerCase();
    const s=await brainSettings(ctx.chat);
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
      "Estado: *"+(s.enabled?"ACTIVO":"APAGADO")+"*\nModo: *"+s.mode+"*\n\n"+
      "🧹 Detecta insultos directos, amenazas y lenguaje fuerte.\n"+
      "💬 No sanciona una mala palabra suelta ni una primera cargada.\n"+
      "⚠️ Modo firme: ante ataques repetidos, advertencias; con 3 advertencias expulsa (si el bot es admin).\n"+
      "🔒 Nunca da permisos de compra a otros miembros.\n\n"+
      "*/cerebro on* — Activar en este grupo\n"+
      "*/cerebro off* — Desactivar\n"+
      "*/cerebro modo suave* — Solo intervenir\n"+
      "*/cerebro modo firme* — Sanciones graduales\n\n"+
      "No analiza fotos, audios o videos por ahora."
    );
  },
});
