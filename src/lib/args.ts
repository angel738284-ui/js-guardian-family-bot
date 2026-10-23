export const onOff = (value: boolean) => (value ? "ON" : "OFF");

export function nextValue(args: string, current: boolean): boolean {
  const word = args.toLowerCase();
  if (word === "on") return true;
  if (word === "off") return false;
  return !current;
}

export function inviteCode(text: string): string | null {
  return text.match(/chat\.whatsapp\.com\/([A-Za-z0-9]{10,})/)?.[1] ?? (/^[A-Za-z0-9]{10,}$/.test(text.trim()) ? text.trim() : null);
}

// "add global hi = hello" → action "add", global true, body "hi = hello".
export function parseReplyArgs(args: string): { action: string; global: boolean; body: string } {
  const [action = "list", ...rest] = args.trim().split(/\s+/);
  const global = rest[0]?.toLowerCase() === "global";
  return { action: action.toLowerCase(), global, body: (global ? rest.slice(1) : rest).join(" ").trim() };
}

// "10m", "2h", "tomorrow 9:00" style times are handled by parseWhen; this adds plain "HH:MM" for today or tomorrow.
export function parseTimeOfDay(input: string, now = new Date()): number | null {
  const match = input.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const at = new Date(now);
  at.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at.getTime();
}

export function parseAmount(input: string): number | null {
  const value = Number(input.replace(/[,_]/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

export function formatMoney(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
