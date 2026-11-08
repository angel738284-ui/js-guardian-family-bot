/** Convierte exclusivamente códigos legítimos de invitación en enlaces compartibles. */
export function buildGroupInviteMessage(groupName:string, code:string):string {
  // Nunca permitir URL arbitraria ni contenido que simule un código.
  if (!/^[A-Za-z0-9_-]{15,64}$/.test(code))
    throw new Error("Código de invitación inválido.");
  const name=groupName.replace(/[\r\n*_~`]/g," ").trim().slice(0,80) || "JS Family";
  return [
    "🔗 *INVITACIÓN AL GRUPO*",
    "",
    "👥 *"+name+"*",
    "",
    "🎮 ¡Sumate a nuestra comunidad de Free Fire!",
    "Compartí este enlace con quienes quieran entrar:",
    "",
    "https://chat.whatsapp.com/"+code,
    "",
    "🛡️ Al ingresar, respetá las reglas del grupo.",
    "📲 *Reenviá este mensaje para invitar a más jugadores.*"
  ].join("\n");
}
