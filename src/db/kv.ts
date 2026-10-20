import { mkdir } from "node:fs/promises";
import { SQL } from "bun";
import { config } from "../config.ts";

let db: SQL | null = null;

function database(): SQL {
  if (!db) throw new Error("Database is not open yet. Call openDatabase() first.");
  return db;
}

export async function openDatabase(): Promise<void> {
  if (db) return;

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
}

export const kv = {
  async get<T>(key: string): Promise<T | null> {
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
    await database()`DELETE FROM bot_kv WHERE key = ${key}`;
  },

  async all(): Promise<Record<string, unknown>> {
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
    await database()`DELETE FROM bot_kv`;
  },
};
