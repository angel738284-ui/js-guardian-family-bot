export function userPart(jid: string | null | undefined): string {
  if (!jid) return "";
  return String(jid).split("@")[0]!.split(":")[0]!;
}

export function normalizeId(jid: string | null | undefined): string {
  const user = userPart(jid);
  const digits = user.replace(/\D/g, "");
  return digits || user;
}

export function phoneToJid(phone: string): string {
  return `${phone.replace(/\D/g, "")}@s.whatsapp.net`;
}

export function isGroupJid(jid: string): boolean {
  return jid.endsWith("@g.us");
}

export function isLidJid(jid: string): boolean {
  return jid.endsWith("@lid");
}

export function isPhoneJid(jid: string): boolean {
  return jid.endsWith("@s.whatsapp.net");
}

export function mentionTag(jid: string): string {
  return `@${userPart(jid)}`;
}
