import { command } from "../core/command.ts";
import { consultRdPromos, formatRdPromos, formatJsPriceLists } from "../features/rdPromos.ts";

// Solo el dueño puede gastar cuota de Volsever. Funciona en privado o en grupo.
command({
  name: "promord",
  aliases: ["promosrd", "promo"],
  description: "Verificar las promociones de JS Recargas por ID (solo consulta)",
  category: "tools",
  usage: "<ID Free Fire>",
  permission: "owner",
  run: async (ctx) => {
    const id = ctx.args.trim();
    if (!/^\d{6,15}$/.test(id)) {
      await ctx.reply("🔎 Usá */promo 11572310927* (reemplazá por el ID del jugador).");
      return;
    }
    try {
      const result = await consultRdPromos(id);
      await ctx.reply(formatRdPromos(result));
    } catch (error) {
      await ctx.reply("⚠️ " + (error instanceof Error ? error.message : "No se pudieron consultar las promociones."));
    }
  },
});

command({
  name: "precios",
  description: "Mostrar precios de diamantes JS Recargas con y sin promociones",
  category: "tools",
  run: async (ctx) => {
    await ctx.reply(formatJsPriceLists());
  },
});
