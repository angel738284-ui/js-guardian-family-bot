import { command } from "../core/command.ts";
import { kieConfigured, kieEnabled, setKieEnabled } from "../features/ai/kie.ts";

command({
  name: "kie",
  description: "Activar, desactivar y consultar GPT-6 Luna en este chat",
  category: "tools",
  usage: "on|off|estado",
  permission: "owner",
  run: async (ctx) => {
    const action = ctx.args.trim().toLowerCase();
    if (!kieConfigured()) {
      await ctx.replyFail("Kie no está configurado. Revisá KIE_API_KEY en Render.");
      return;
    }
    if (action !== "on" && action !== "off") {
      const active = await kieEnabled(ctx.chat);
      await ctx.reply("🤖 *JS Guardian · GPT-6 Luna*\nEstado en este chat: *" + (active ? "ACTIVO" : "APAGADO") + "*\nUsá /kie on o /kie off.");
      return;
    }
    await setKieEnabled(ctx.chat, action === "on");
    await ctx.replyOk("IA de Kie " + (action === "on" ? "activada" : "desactivada") + " en este chat.");
  },
});
