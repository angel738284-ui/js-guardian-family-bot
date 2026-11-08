/** Reglas originales de La Purga de JS, aprobadas para el evento Free Fire.
 * Una sola fuente para .reglas purga, .purga reglas y los anuncios.
 */
export const PURGA_RULES = [
  "1️⃣ *Solo JS puede matar.* Ningún participante puede eliminar a otro.",
  "2️⃣ *Prohibido hacerse daño entre jugadores.* Nadie puede causar daño a otro participante.",
  "3️⃣ *Podés caer, lootear y esconderte.* El objetivo es sobrevivir a JS.",
  "4️⃣ *Ganador:* el último superviviente que permanezca vivo con *0 de daño causado*.",
  "5️⃣ *Se permite campear.* Podés esconderte para sobrevivir.",
  "6️⃣ *Prohibido usar vehículos.*",
  "7️⃣ *Prohibido subir a techos, lugares altos o inaccesibles.* No vale ocultarse donde JS no pueda alcanzarte.",
  "8️⃣ *Emotes en la primera zona:* podés hacerle un emote a JS; *solo si a JS le gusta y decide perdonarte*, tenés *30 segundos* para escapar. El perdón no está garantizado.",
  "9️⃣ *Desde la segunda zona no hay perdón.* JS puede eliminarte sin excepciones, aunque hagas un emote.",
] as const;

export const PURGA_RULES_TEXT = PURGA_RULES.join("\n\n");

export function formatPurgaRules(): string {
  return "🔥 *REGLAS OFICIALES — LA PURGA DE JS* 🔥\n\n"+
    PURGA_RULES_TEXT+
    "\n\n🏆 *Gana el último superviviente con 0 de daño causado.*";
}

/** Reutilizado al publicar una Purga; evita reglas contradictorias. */
export function formatPurgaAnnouncement(time:string):string {
  return [
    "🔥 *LA PURGA DE JS FAMILY* 🔥",
    "",
    "🕗 *Hoy a las "+time+" hs (Argentina)*",
    "🎮 *Free Fire — La Purga*",
    "",
    "📋 *INSCRIPCIONES*",
    "Mandá *solamente tu ID de Free Fire* en este grupo. JS Guardian verificará tu nombre y te anotará automáticamente en la lista.",
    "",
    "⚔️ *REGLAS*",
    PURGA_RULES_TEXT,
    "",
    "🏆 *GANADOR:* el último superviviente con *0 de daño causado*.",
    "",
    "📌 Las inscripciones quedan abiertas hasta que JS cierre la lista.",
  ].join("\n");
}
