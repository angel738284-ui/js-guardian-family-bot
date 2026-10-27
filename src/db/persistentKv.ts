/**
 * Almacenamiento de TODOS los ajustes de Asena en Supabase.
 * Las sesiones de WhatsApp quedan fuera: siguen usando el almacén de sesión.
 * El proceso carga las claves una vez y escribe en remoto ANTES de actualizar caché.
 * Si Supabase falla, la operación falla (no se guarda solo en RAM/Render).
 */
import {
  guardianStoreReady,
  listGuardianStateScope,
  readGuardianState,
  writeGuardianState,
  deleteGuardianState,
  clearGuardianStateScope,
} from "../features/jsGuardianStore.ts";

const SCOPE = "asena:bot_kv";
const memory = new Map<string, unknown>();
let loaded = false;
let operations: Promise<void> = Promise.resolve();

function ensureReady(): void {
  if (!loaded) throw new Error("Asena KV: hay que inicializar el almacenamiento persistente antes de usarlo.");
}
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function enqueue<T>(action: () => Promise<T>): Promise<T> {
  const next = operations.catch(() => {}).then(action);
  operations = next.then(() => {}, () => {});
  return next;
}

export async function openPersistentKv(): Promise<void> {
  if (loaded) return;
  if (!guardianStoreReady()) throw new Error("Faltan variables JS_GUARDIAN_DB_* para guardar ajustes.");
  // Con RLS una credencial incorrecta podría devolver un SELECT vacío con HTTP 200.
  // Exigimos un registro de control preexistente antes de tomar un vacío como correcto.
  const marker = await readGuardianState("asena:meta", "kv_ready");
  if (marker?.version !== 1 || marker?.system !== "asena") {
    throw new Error("Supabase: no se pudo validar el acceso a los ajustes de JS Guardian.");
  }
  const rows = await listGuardianStateScope(SCOPE);
  const incoming = new Map<string, unknown>();
  for (const row of rows) {
    if (typeof row.item !== "string" || !row.value || !Object.hasOwn(row.value, "data")) {
      throw new Error("Asena KV: hay un registro inválido en Supabase.");
    }
    incoming.set(row.item, clone(row.value.data));
  }
  memory.clear();
  for (const [key, value] of incoming) memory.set(key, value);
  loaded = true;
  console.log(`✓ Configuraciones Asena cargadas desde Supabase (${memory.size} claves)`);
}

export const persistentKv = {
  get<T>(key: string): T | null {
    ensureReady();
    return memory.has(key) ? clone(memory.get(key) as T) : null;
  },
  async set(key: string, value: unknown): Promise<void> {
    ensureReady();
    if (value === null || value === undefined) return persistentKv.delete(key);
    const saved = clone(value);
    await enqueue(async () => {
      await writeGuardianState(SCOPE, key, { data: saved });
      memory.set(key, saved);
    });
  },
  async delete(key: string): Promise<void> {
    ensureReady();
    await enqueue(async () => {
      await deleteGuardianState(SCOPE, key);
      memory.delete(key);
    });
  },
  async all(): Promise<Record<string, unknown>> {
    ensureReady();
    await operations;
    return Object.fromEntries([...memory.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => [key, clone(val)]));
  },
  async clear(): Promise<void> {
    ensureReady();
    await enqueue(async () => {
      await clearGuardianStateScope(SCOPE);
      memory.clear();
    });
  },
  count(): number {
    ensureReady();
    return memory.size;
  },
};
