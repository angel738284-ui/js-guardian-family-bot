import { config } from "../config.ts";
import { kv } from "../db/kv.ts";
import { normalizeId } from "../lib/jid.ts";

export interface Sender {
  senderIds: string[];
  fromMe: boolean;
}

export type Mode = "public" | "private";

const ownerIds = new Set<string>(config.owners);

export function addOwnerIds(ids: string[]): void {
  for (const id of ids) {
    const normalized = normalizeId(id);
    if (normalized) ownerIds.add(normalized);
  }
}

export function ownerNumbers(): string[] {
  return config.owners.length ? [...config.owners] : [...ownerIds].filter((id) => /^\d{6,15}$/.test(id));
}

export async function loadSavedOwner(): Promise<void> {
  const saved = await kv.get<string>("owner_override");
  if (saved) addOwnerIds([saved]);
}

export async function saveOwner(phone: string): Promise<void> {
  const digits = phone.replace(/\D/g, "");
  await kv.set("owner_override", digits);
  addOwnerIds([digits]);
}

export function isOwner(sender: Sender): boolean {
  if (sender.fromMe) return true;
  return isOwnerNumber(sender);
}

export function isOwnerNumber(sender: Sender): boolean {
  return sender.senderIds.some((id) => ownerIds.has(id));
}

export async function isSudo(sender: Sender): Promise<boolean> {
  const sudoList = await listSudo();
  return sender.senderIds.some((id) => sudoList.includes(id));
}

export async function isPrivileged(sender: Sender): Promise<boolean> {
  return isOwner(sender) || (await isSudo(sender));
}


export async function getMode(): Promise<Mode> {
  const stored = await kv.get<Mode>("mode");
  return stored ?? config.defaultMode;
}

export async function setMode(mode: Mode): Promise<void> {
  await kv.set("mode", mode);
}


export async function listSudo(): Promise<string[]> {
  const stored = (await kv.get<string[]>("sudo")) ?? [];
  return [...new Set([...config.sudo, ...stored.map(normalizeId)])].filter(Boolean);
}

export async function addSudo(id: string): Promise<string> {
  const normalized = normalizeId(id);
  if (!normalized) throw new Error("Invalid number.");
  const stored = (await kv.get<string[]>("sudo")) ?? [];
  if (!stored.includes(normalized)) stored.push(normalized);
  await kv.set("sudo", stored);
  return normalized;
}

export async function removeSudo(id: string): Promise<string> {
  const normalized = normalizeId(id);
  const stored = (await kv.get<string[]>("sudo")) ?? [];
  await kv.set(
    "sudo",
    stored.filter((item) => item !== normalized),
  );
  return normalized;
}

export async function listBanned(): Promise<string[]> {
  return (await kv.get<string[]>("banned")) ?? [];
}

export async function isBanned(sender: Sender): Promise<boolean> {
  const banned = await listBanned();
  return banned.length > 0 && sender.senderIds.some((id) => banned.includes(id));
}

export async function setBanned(id: string, banned: boolean): Promise<string> {
  const normalized = normalizeId(id);
  if (!normalized) throw new Error("Invalid number.");
  const list = (await listBanned()).filter((item) => item !== normalized);
  if (banned) list.push(normalized);
  await kv.set("banned", list);
  return normalized;
}
