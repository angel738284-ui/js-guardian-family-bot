import { kv } from "../db/kv.ts";

export interface GroupSettings {
  welcome: boolean;
  welcomeText: string;
  goodbye: boolean;
  goodbyeText: string;
  antilink: boolean;
  antispam: boolean;
  antispamLimit: number;
  antispamWindowMs: number;
  warnLimit: number;
  muted: string[];
  disabledCommands: string[];
}

const DEFAULTS: GroupSettings = {
  welcome: false,
  welcomeText: "Welcome @user to *@group*!\nMembers: @count",
  goodbye: false,
  goodbyeText: "@user left *@group*.",
  antilink: false,
  antispam: false,
  antispamLimit: 5,
  antispamWindowMs: 8_000,
  warnLimit: 3,
  muted: [],
  disabledCommands: [],
};

const settingsKey = (groupJid: string) => `group:${groupJid}`;

export async function getGroupSettings(groupJid: string): Promise<GroupSettings> {
  const stored = await kv.get<Partial<GroupSettings>>(settingsKey(groupJid));
  return { ...DEFAULTS, ...stored };
}

export async function updateGroupSettings(groupJid: string, changes: Partial<GroupSettings>): Promise<GroupSettings> {
  const next = { ...(await getGroupSettings(groupJid)), ...changes };
  await kv.set(settingsKey(groupJid), next);
  return next;
}


const warnKey = (groupJid: string, userId: string) => `warns:${groupJid}:${userId}`;

export async function getWarns(groupJid: string, userId: string): Promise<number> {
  return (await kv.get<number>(warnKey(groupJid, userId))) ?? 0;
}

export async function addWarn(groupJid: string, userId: string): Promise<number> {
  const count = (await getWarns(groupJid, userId)) + 1;
  await kv.set(warnKey(groupJid, userId), count);
  return count;
}

export async function resetWarns(groupJid: string, userId: string): Promise<void> {
  await kv.delete(warnKey(groupJid, userId));
}
