import { kv } from "../db/kv.ts";
import { normalizeId } from "../lib/jid.ts";

export interface AuditEntry {
  id: string;
  time: number;
  action: string;
  actor: string;
  chat: string | null;
  details: Record<string, unknown> | null;
}

const MAX_ENTRIES = 500;
let entries: AuditEntry[] | null = null;

async function load(): Promise<AuditEntry[]> {
  if (!entries) entries = ((await kv.get<AuditEntry[]>("audit_log")) ?? []).slice(-MAX_ENTRIES);
  return entries;
}

export async function writeAudit(input: {
  action: string;
  actor: string;
  chat?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const list = await load();
  list.push({
    id: `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    time: Date.now(),
    action: input.action,
    actor: normalizeId(input.actor) || input.actor,
    chat: input.chat ?? null,
    details: input.details ?? null,
  });
  if (list.length > MAX_ENTRIES) list.splice(0, list.length - MAX_ENTRIES);
  await kv.set("audit_log", list);
}

export async function queryAudit(options: { limit?: number; action?: string } = {}): Promise<AuditEntry[]> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const filter = options.action?.toLowerCase();
  return [...(await load())]
    .reverse()
    .filter((entry) => !filter || entry.action.toLowerCase().includes(filter))
    .slice(0, limit);
}

export async function clearAudit(): Promise<void> {
  entries = [];
  await kv.set("audit_log", []);
}
