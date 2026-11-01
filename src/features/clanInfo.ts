import type { Ctx } from "../core/context.ts";

const CLAN_INFO = [
  "🔥 *¿QUERÉS UNIRTE A JS FAMILY?* 🔥",
  "",
  "🏆 *REQUISITO: 200 PLACAS SEMANALES*",
  "Para entrar y permanecer en JS Family tenés que conseguir *al menos 200 placas por semana*.",
  "",
  "⚔️ *¿CÓMO SE CONSIGUEN?*",
  "Las placas se consiguen jugando *Guerra de Clanes*. Jugar BR, Duelo de Escuadras u otras modalidades normales no suma placas para este requisito.",
  "",
  "🎯 *¿CUÁNTAS KILLS NECESITÁS?*",
  "Para acercarte a las 200 placas, intentá hacer *7 u 8 kills o más por partida* y conseguir buenas posiciones. Las kills por sí solas no garantizan llegar a 200: también importa el puntaje de cada partida.",
  "",
  "📊 *SOLO CUENTAN TUS 5 MEJORES PARTIDAS*",
  "Podés jugar muchas partidas de Guerra de Clanes, pero únicamente tus *cinco mejores resultados* cuentan para el puntaje semanal.",
  "Si ya tenés cinco partidas muy buenas y después jugás otra con menos puntos, esa última no te suma puntos adicionales. Si mejorás una de tus cinco mejores marcas, sí puede subir tu total.",
  "",
  "👑 *EN JS FAMILY BUSCAMOS COMPROMISO*",
  "✅ Cumplir las 200 placas cada semana.",
  "✅ Jugar Guerra de Clanes.",
  "✅ Buscar mejorar tus cinco mejores partidas.",
  "",
  "🔥 *¿ESTÁS LISTO PARA UNIRTE A JS FAMILY?*"
].join("\n");

export async function clanInfo(ctx: Ctx): Promise<boolean> {
  if (!/^\.clan\s*$/i.test(ctx.text.trim())) return false;
  await ctx.reply(CLAN_INFO);
  return true;
}
