// Persistencia separada para JS Guardian. No utiliza tablas ni permisos de JS Torneos.
export type GuardianConfig = { antiSticker: boolean; antiLink: boolean; antiExplicitSticker?: boolean; allowedDomains: string[] };
const defaults: GuardianConfig = { antiSticker: true, antiLink: true, antiExplicitSticker: false, allowedDomains: [] };
const base = process.env.JS_GUARDIAN_DB_URL?.replace(/\/$/, "");
const apiKey = process.env.JS_GUARDIAN_DB_KEY;
const secret = process.env.JS_GUARDIAN_DB_SECRET;
export function guardianStoreReady(): boolean { return !!(base && apiKey && secret); }

async function query(method: string, path: string, body?: unknown): Promise<any> {
  if (!guardianStoreReady()) throw new Error("El almacenamiento persistente de JS Guardian no está configurado.");
  const headers: Record<string, string> = {
    "apikey": apiKey!,
    "Authorization": `Bearer ${apiKey}`,
    "x-js-guardian-secret": secret!,
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Prefer": method === "POST" && path.startsWith("js_guardian_state?") ? "resolution=merge-duplicates,return=minimal" : "return=minimal",
  };
  const response = await fetch(`${base}/rest/v1/${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Almacenamiento JS Guardian: ${response.status} ${detail}`);
  }
  if (response.status === 204) return null;
  const raw = await response.text();
  return raw ? JSON.parse(raw) : null;
}
const eq = (s: string) => `eq.${encodeURIComponent(s)}`;
export async function readGuardianState(scope: string, item: string): Promise<Record<string, unknown> | null> {
  const path = `js_guardian_state?scope=${eq(scope)}&item=${eq(item)}&select=value&limit=1`;
  const rows = (await query("GET", path)) as { value: Record<string, unknown> }[];
  return rows[0]?.value ?? null;
}
export async function writeGuardianState(scope: string, item: string, value: Record<string, unknown>): Promise<void> {
  await query("POST", "js_guardian_state?on_conflict=scope,item", { scope, item, value, updated_at: new Date().toISOString() });
}
export async function deleteGuardianState(scope: string, item: string): Promise<void> {
  await query("DELETE", `js_guardian_state?scope=${eq(scope)}&item=${eq(item)}`);
}
const cache = new Map<string, { settings: GuardianConfig; until: number }>();
export async function getGuardianConfig(group: string): Promise<GuardianConfig> {
  const old = cache.get(group);
  if (old && old.until > Date.now()) return old.settings;
  const stored = await readGuardianState(`config:${group}`, "settings");
  const v = { ...defaults, ...stored } as GuardianConfig;
  if (!Array.isArray(v.allowedDomains)) v.allowedDomains = [];
  cache.set(group, { settings: v, until: Date.now() + 20_000 });
  return v;
}
export async function setGuardianConfig(group: string, value: GuardianConfig): Promise<void> {
  await writeGuardianState(`config:${group}`, "settings", value);
  cache.set(group, { settings: value, until: Date.now() + 20_000 });
}
export async function bannedAliases(group: string, ids: string[]): Promise<boolean> {
  for (const id of [...new Set(ids.filter(Boolean))]) {
    if (await readGuardianState(`ban:${group}`, id)) return true;
  }
  return false;
}
export async function setBannedAliases(group: string, ids: string[], banned: boolean): Promise<void> {
  const scope = `ban:${group}`;
  const all = new Set(ids.filter(Boolean));
  if (!banned) {
    // Los alias LID/teléfono apuntan a la misma ficha. Desbanear uno retira todos.
    for (const id of [...all]) {
      const stored = await readGuardianState(scope, id);
      if (Array.isArray(stored?.aliases)) {
        for (const alias of stored.aliases) if (typeof alias === "string") all.add(alias);
      }
    }
  }
  for (const id of all) {
    if (banned) await writeGuardianState(scope, id, { bannedAt: new Date().toISOString(), aliases: [...all] });
    else await deleteGuardianState(scope, id);
  }
}
const pending = new Map<string, Promise<unknown>>();
export async function guardianWarnings(group: string, user: string): Promise<number> {
  return Number((await readGuardianState(`warn:${group}`, user))?.count ?? 0);
}
export async function updateGuardianWarnings(group: string, user: string, mode: "increment" | "reset"): Promise<number> {
  const k = `${group}|${user}`;
  const previous = pending.get(k) ?? Promise.resolve();
  const action = previous.catch(() => {}).then(async () => {
    if (mode === "reset") {
      await deleteGuardianState(`warn:${group}`, user);
      return 0;
    }
    const count = (await guardianWarnings(group, user)) + 1;
    await writeGuardianState(`warn:${group}`, user, { count });
    return count;
  });
  pending.set(k, action);
  try { return await action; }
  finally { if (pending.get(k) === action) pending.delete(k); }
}
export interface GuardianAudit { group_id: string; action: string; actor_id?: string; target_id?: string; details?: string }
export async function saveGuardianAudit(e: GuardianAudit): Promise<void> {
  await query("POST", "js_guardian_audit", e);
}
export async function recentGuardianAudit(group: string): Promise<(GuardianAudit & { created_at: string })[]> {
  return (await query("GET", `js_guardian_audit?group_id=${eq(group)}&select=action,actor_id,target_id,details,created_at&order=created_at.desc&limit=10`)) ?? [];
}

// Acceso a un ámbito completo, usado para los ajustes originales de Asena.
// La tabla y su política RLS son las mismas del resto de JS Guardian.
export interface GuardianStateRow { item: string; value: Record<string, unknown> }
export async function listGuardianStateScope(scope: string): Promise<GuardianStateRow[]> {
  const results: GuardianStateRow[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const path = `js_guardian_state?scope=${eq(scope)}&select=item,value&order=item.asc&limit=${pageSize}&offset=${offset}`;
    const rows = (await query("GET", path)) as GuardianStateRow[];
    results.push(...rows);
    if (rows.length < pageSize) return results;
    if (offset > 20_000) throw new Error("Supabase tiene demasiadas configuraciones: revisar paginación.");
  }
}
export async function clearGuardianStateScope(scope: string): Promise<void> {
  if (scope !== "asena:bot_kv") throw new Error("Solo se puede limpiar el ámbito de ajustes Asena.");
  await query("DELETE", `js_guardian_state?scope=${eq(scope)}`);
}
