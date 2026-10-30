import type { Ctx } from "../../core/context.ts";

// Argentina: WhatsApp suele incluir 9 después del código 54 para móviles.
// Usamos únicamente los IDs autenticados en el sobre del evento; jamás el texto o nombre visible.
function phoneKey(input: string): string {
  const digits = input.replace(/\D/g, "");
  return digits.startsWith("549") && digits.length === 13
    ? "54" + digits.slice(3)
    : digits;
}

export function isJSLeader(sender: Pick<Ctx, "senderIds" | "fromMe">): boolean {
  if (sender.fromMe) return false;
  const configured = phoneKey(process.env.JS_LEADER_PHONE ?? "");
  if (!configured || configured.length < 10) return false;
  return sender.senderIds.some(id => phoneKey(id) === configured);
}

export function isLeaderIdentityQuestion(input: string): boolean {
  const text = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return /\b(quien soy(?: yo)?|como me llamo|me conoces|quien es tu lider|quien es tu jefe|quien es tu dueno)\b/.test(text);
}

export function leaderIdentityReply(): string {
  return "👑 ¿Vos? Sos *JS*, el líder de *JS Family*. " +
    "Al que le tengo que hacer caso… aunque cada tanto toque cargarlo por cómo juega Free Fire 😏";
}
