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
