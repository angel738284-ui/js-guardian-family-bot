import { kv } from "../db/kv.ts";

const key = (chat: string) => `allowed_cmds:${chat}`;

// In private mode, these commands still work for everyone in this chat.
export async function getAllowed(chat: string): Promise<string[]> {
  return (await kv.get<string[]>(key(chat))) ?? [];
}

export async function isAllowedIn(chat: string, command: string): Promise<boolean> {
  return (await getAllowed(chat)).includes(command);
}

export async function setAllowed(chat: string, commands: string[]): Promise<void> {
  await kv.set(key(chat), commands.length ? [...new Set(commands)] : null);
}
