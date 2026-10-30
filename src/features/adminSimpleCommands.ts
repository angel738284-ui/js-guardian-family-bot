import type { Ctx } from "../core/context.ts";
import { kv } from "../db/kv.ts";
import { isGroupAdmin } from "./groups.ts";

// Lista POSITIVA de funciones delegables. Nunca se agregan pagos, saldo,
// confirmaciones ni cambios críticos del bot aunque el administrador use #.
export const ADMIN_SIMPLE_COMMANDS = [
  "reglas","precios","torneos","warn","unwarn","warns","linksjs",
] as const;
const allowed = new Set<string>(ADMIN_SIMPLE_COMMANDS);
const key = (chat:string) => "js:admins:simple_commands:"+chat;

export async function adminCommandsEnabled(chat:string):Promise<boolean> {
  return (await kv.get<boolean>(key(chat))) === true;
}
export async function setAdminCommandsEnabled(chat:string,enabled:boolean):Promise<void> {
  await kv.set(key(chat),enabled);
}
export async function canUseSimpleAdminCommand(ctx:Ctx,commandName:string):Promise<boolean> {
  if (!ctx.isGroup || ctx.fromMe || !allowed.has(commandName)) return false;
  if (!(await adminCommandsEnabled(ctx.chat))) return false;
  const group = await ctx.group();
  return isGroupAdmin(group,ctx.senderIds);
}
