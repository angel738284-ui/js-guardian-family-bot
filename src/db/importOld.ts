import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "../config.ts";
import { logger } from "../lib/logger.ts";
import { kv } from "./kv.ts";

const OLD_DATABASE = path.resolve("database.db");
const DONE_KEY = "imported_v4_settings";

const DROPPED_KEYS = new Set(["rbac_roles", "setup_step"]);

export async function importOldSettings(): Promise<void> {
  if (config.database.usePostgres || !existsSync(OLD_DATABASE)) return;
  if (await kv.get<boolean>(DONE_KEY)) return;

  let rows: { key: string; value: string | null }[] = [];
  try {
    const old = new Database(OLD_DATABASE, { readonly: true });
    rows = old.query<{ key: string; value: string | null }, []>("SELECT key, value FROM BotKV").all();
    old.close();
  } catch {
  }

  let imported = 0;
  for (const row of rows) {
    if (!row.value || DROPPED_KEYS.has(row.key)) continue;

    let value: unknown;
    try {
      value = JSON.parse(row.value);
    } catch {
      continue;
    }

    const { key, value: converted } = convert(row.key, value);
    await kv.set(key, converted);
    imported += 1;
  }

  await kv.set(DONE_KEY, true);
  if (imported > 0) logger.info(`Imported ${imported} settings from the old database.db`);
}

function convert(key: string, value: unknown): { key: string; value: unknown } {
  if (key.startsWith("gset:") && value && typeof value === "object") {
    const { disabledPlugins, ...rest } = value as Record<string, unknown>;
    return { key: `group:${key.slice(5)}`, value: { ...rest, disabledCommands: disabledPlugins ?? [] } };
  }

  if (key === "reminders" && Array.isArray(value)) {
    return {
      key,
      value: value.map((item: Record<string, unknown>) => ({ ...item, chat: item.chat ?? item.jid })),
    };
  }

  if (key === "audit_log" && Array.isArray(value)) {
    return {
      key,
      value: value.map((item: Record<string, unknown>) => ({
        id: item.id,
        time: item.ts,
        action: item.action,
        actor: item.actor,
        chat: item.chat ?? null,
        details: item.meta ?? null,
      })),
    };
  }

  return { key, value };
}
