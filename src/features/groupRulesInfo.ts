import type { Ctx } from "../core/context.ts";

const RULES = [
  "📜 *REGLAS DEL GRUPO FREE FIRE — EL SÓTANO JS*",
  "",
  "1️⃣ 🚫 *Nada de contenido para adultos.* Prohibidas las fotos, videos, stickers y enlaces +18.",
  "",
  "2️⃣ 🙅‍♂️ *No abuses de los stickers.* Máximo *2 stickers por minuto* por persona. Nada de stickers +18 ni fuera de tema.",
  "",
  "3️⃣ 🎮 *Hablemos de Free Fire.* Compartí partidas, consejos, memes y clips relacionados con el juego.",
  "",
  "4️⃣ 🤝 *Respeto entre todos.* No insultar, bardear, humillar, burlarse ni provocar a otros jugadores con emotes. Si alguien te falta el respeto, mandá pruebas a los administradores.",
  "",
  "5️⃣ 🔫 *Sin spam.* Prohibidas las cadenas, los enlaces sospechosos y la publicidad molesta.",
  "",
  "6️⃣ 🏆 *Ayudá y divertite.* Si alguien pregunta algo del juego, respondé con buena onda.",
  "",
  "7️⃣ ⚠️ *Incumplir las reglas tiene consecuencias.* Puede haber silencio temporal o expulsión según la gravedad. *NO SE PERMITEN VENTAS* en el grupo.",
  "",
  "8️⃣ 🎙️ *No abuses de los audios ni de las reacciones sin sentido.* Se permiten dinámicas de audios cuando las organicen los administradores.",
  "",
  "9️⃣ 📵 *Prohibidas las llamadas grupales.* Hacer llamadas sin autorización puede terminar en expulsión.",
  "",
  "🔟 ⚽🗳️ *Nada de peleas por política ni equipos de fútbol.* Evitá discusiones y provocaciones; pueden terminar en expulsión.",
  "",
  "👑 *ID DE JS:* 11572310927",
  "",
  "🔥 *Respetá las reglas y disfrutá de JS Family.*"
].join("\n");

export async function groupRulesInfo(ctx: Ctx): Promise<boolean> {
  if (!/^[./]reglas\s*$/i.test(ctx.text.trim())) return false;
  await ctx.reply(RULES);
  return true;
}
