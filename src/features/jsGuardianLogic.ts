// Lógica verificable sin conexión WhatsApp ni base de datos.
const LINK_RE = /(?:https?:\/\/|www\.|(?:wa\.me|chat\.whatsapp\.com|t\.me)\/)\S+/gi;
export function domainFromInput(input: string): string | null {
  const cleaned = input.trim().replace(/[),.;!?]+$/, "");
  if (!cleaned) return null;
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(cleaned) ? cleaned : "https://" + cleaned);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!host || !host.includes(".") || host.includes("..") || /[^a-z0-9.-]/.test(host)) return null;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null;
    return host;
  } catch { return null; }
}
export function blockedLinkIn(text: string, allowedDomains: string[]): string | null {
  const links = text.match(LINK_RE) ?? [];
  for (const link of links) {
    const host = domainFromInput(link);
    if (!host) return link;
    if (!allowedDomains.some((ok) => host === ok || host.endsWith("." + ok))) return link;
  }
  return null;
}
export function memberAliases(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map(v => (String(v ?? "").split("@")[0] ?? "").split(":")[0]!.replace(/\D/g, "")).filter(Boolean))];
}
// Es una advertencia por ráfaga; no vuelve a sancionar hasta que venza la ventana.
export function countInWindow(times: number[], now: number, windowMs: number): number[] {
  return [...times.filter(t => now - t >= 0 && now - t < windowMs), now];
}
