import { command } from "../core/command.ts";
import { kieConfigured, kieEnabled, setKieEnabled } from "../features/ai/kie.ts";
import { grokPrimary } from "../features/ai/grok.ts";

command({
  name: "habla",
  aliases: ["nohables", "kie"],
  description: "Activar, desactivar y consultar la IA de JS Guardian en este chat",
  category: "tools",
  usage: "on|off|estado",
  permission: "owner",
  run: async (ctx) => {
    const action = ctx.command === "nohables" ? "off" : (ctx.args.trim().toLowerCase() || "on");
    if (!kieConfigured()) {
      await ctx.replyFail("La IA no está configurada. Revisá GROK_API_KEY o KIE_API_KEY en Render.");
      return;
    }
    if (action !== "on" && action !== "off") {
      const active = await kieEnabled(ctx.chat);
      await ctx.reply("🤖 *JS Guardian · " + (grokPrimary() ? "Grok (Kie de respaldo)" : "Kie") + "*\nEstado en este chat: *" + (active ? "ACTIVO" : "APAGADO") + "*\nUsá *.habla* para activar o *.nohables* para silenciar.");
      return;
    }
    await setKieEnabled(ctx.chat, action === "on");
    await ctx.replyOk("JS Guardian " + (action === "on" ? "ya puede hablar" : "se queda callado") + " en este chat.");
  },
});
