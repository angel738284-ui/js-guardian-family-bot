import { command } from "../core/command.ts";

// Texto oficial de JS Family. Se puede usar /reglas o #reglas.
export const REGLAS_FREE_FIRE = `📜 Reglas del Grupo Free Fire

1️⃣ 🚫 Nada de contenido para adultos (ni fotos, ni videos, ni links).
2️⃣ 🙅‍♂️ No abusar de los stickers maximo 2(y mucho menos 🔞 o fuera de tema,no mandar mas de 2 stiker por minuto).
3️⃣ 🎮 Hablar de Free Fire → el grupo es para compartir partidas, consejos, memes y clips del juego.
4️⃣ 🤝 Respeto entre todos → no bardear ni insultar a otros jugadores,no emotes a nadie,no burlarse ni humillar a nadie,si alguno te lo hizo mandar pruebas.
5️⃣ 🔫 Nada de spam → prohibido mandar cadenas, links raros o publicidad molesta.

6️⃣ 🏆 Ayudar y divertirse → si alguien pregunta algo del juego, responder con buena onda.
7️⃣ ⚠️ Incumplir reglas = sanción (silencio o expulsión), NO VENTAS 
8️⃣No abusar de audios,reaccionar sin sentido a los comentarios, al menos que haga dinámicas de audios.
9️⃣No hacer llamada grupal o ban.
🔟NO PELEAR POR POLITICA NI EQUIPOS DE FÚTBOL O BANANEO.
MI ID 11572310927`;

command({
  name: "reglas",
  description: "Enviar las reglas oficiales de JS Family",
  category: "group",
  groupOnly: true,
  permission: "owner",
  run: async (ctx) => {
    await ctx.reply(REGLAS_FREE_FIRE);
  },
});
