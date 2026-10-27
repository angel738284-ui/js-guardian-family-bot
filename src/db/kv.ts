import { mkdir } from "node:fs/promises";
import { SQL } from "bun";
import { config } from "../config.ts";
import { guardianStoreReady } from "../features/jsGuardianStore.ts";
import { openPersistentKv, persistentKv } from "./persistentKv.ts";

let db: SQL | null = null;
let useRemote = false;

function database(): SQL {
  if (!db) throw new Error("Database is not open yet. Call openDatabase() first.");
  return db;
}

export async function openDatabase(): Promise<void> {
  if (db || useRemote) return;
  if (guardianStoreReady()) {
    await openPersistentKv();
    useRemote = true;
    return;
  }
  // Un servidor con sesión no puede operar si falta su almacenamiento persistente:
  // evitamos que un reinicio guarde cambios solo en el disco efímero de Render.
  if (config.sessionId) throw new Error("JS Guardian necesita las variables JS_GUARDIAN_DB_* para guardar su configuración.");

  if (config.database.usePostgres) {
    db = new SQL(config.database.postgresUrl);
  } else {
    await mkdir(config.database.dataDir, { recursive: true });
    db = new SQL({ adapter: "sqlite", filename: config.database.botFile });
  }

  await db`CREATE TABLE IF NOT EXISTS bot_kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)`;
}

export async function closeDatabase(): Promise<void> {
  await db?.close();
  db = null;
  useRemote = false;
}

export const kv = {
  async get<T>(key: string): Promise<T | null> {
    if (useRemote) return persistentKv.get<T>(key);
    const rows = await database()`SELECT value FROM bot_kv WHERE key = ${key}`;
    const row = rows[0] as { value: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  },

  async set(key: string, value: unknown): Promise<void> {
    if (useRemote) return persistentKv.set(key, value);
    if (value === null || value === undefined) {
      await kv.delete(key);
      return;
    }
    const json = JSON.stringify(value);
    await database()`
      INSERT INTO bot_kv (key, value) VALUES (${key}, ${json})
      ON CONFLICT (key) DO UPDATE SET value = excluded.value
    `;
  },

  async delete(key: string): Promise<void> {
    if (useRemote) return persistentKv.delete(key);
    await database()`DELETE FROM bot_kv WHERE key = ${key}`;
  },

  async all(): Promise<Record<string, unknown>> {
    if (useRemote) return persistentKv.all();
    const rows = (await database()`SELECT key, value FROM bot_kv ORDER BY key`) as { key: string; value: string }[];
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        result[row.key] = row.value;
      }
    }
    return result;
  },

  async clear(): Promise<void> {
    if (useRemote) return persistentKv.clear();
    await database()`DELETE FROM bot_kv`;
  },
};
