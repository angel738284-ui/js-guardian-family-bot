import { command } from "../core/command.ts";
import { grokConfigured, grokPrimary, grokUsageStats } from "../features/ai/grok.ts";

command({
  name: "consumo",
  description: "Consultar las estadísticas de tokens de Grok desde el último reinicio",
  category: "owner",
  permission: "owner",
  run: async (ctx) => {
    const s = grokUsageStats();
    const mode = grokPrimary() ? "Grok 4.7 (principal)" : "Kie (principal)";
    const info = [
      "📊 *CONSUMO DE JS GUARDIAN*",
      "IA actual: *" + mode + "*",
      "Grok configurado: *" + (grokConfigured() ? "SÍ" : "NO") + "*",
      "Modelo: *" + s.model + "*",
      "",
      "*Desde el último reinicio*",
      "Solicitudes Grok: " + s.requests,
      "Errores Grok: " + s.errors,
      "Tokens de entrada: " + s.input.toLocaleString("es-AR"),
      "Tokens de salida: " + s.output.toLocaleString("es-AR"),
      "  (razonamiento: " + s.reasoning.toLocaleString("es-AR") + ")",
      "Entrada en caché: " + s.cached.toLocaleString("es-AR"),
      "*Total de tokens: " + s.total.toLocaleString("es-AR") + "*",
      "",
      "Saldo oficial del intermediario:",
      "https://gpt.teamsoclo.site/check",
      "Estos totales se reinician con el servicio; el saldo real lo informa el proveedor."
    ];
    await ctx.reply(info.join("\n"));
  },
});
