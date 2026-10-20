import { mkdir } from "node:fs/promises";
import { createStore, type WaStore } from "zapo-js";
import { config } from "../config.ts";

export const SESSION_ID = "default";

const PERSISTENT_DOMAINS = [
  "auth",
  "signal",
  "preKey",
  "session",
  "identity",
  "senderKey",
  "appState",
  "privacyToken",
] as const;

let store: WaStore | null = null;
let cleanup: (() => Promise<void>) | null = null;

function providers<B extends string>(backend: B) {
  return {
    auth: backend,
    signal: backend,
    preKey: backend,
    session: backend,
    identity: backend,
    senderKey: backend,
    appState: backend,
    privacyToken: backend,
    messages: "none",
    threads: "none",
    contacts: "none",
  } as const;
}

async function buildStore(): Promise<WaStore> {
  const { authDb, authDbUrl } = config.database;

  switch (authDb) {
    case "postgres": {
      const { createPostgresStore } = await import("@zapo-js/store-postgres");
      const pg = createPostgresStore({ pool: { connectionString: authDbUrl }, tablePrefix: "zapo_" });
      // Postgres needs a background job to delete expired cache rows.
      pg.startCleanup(SESSION_ID);
      return createStore({ backends: { pg }, providers: providers("pg") });
    }
    case "redis": {
      const { createRedisStore } = await import("@zapo-js/store-redis");
      const { default: Redis } = await import("ioredis");
      const redis = createRedisStore({ redis: new Redis(authDbUrl, { lazyConnect: false }), keyPrefix: "asena:" });
      return createStore({ backends: { redis }, providers: providers("redis") });
    }
    case "mongodb": {
      const { createMongoStore } = await import("@zapo-js/store-mongo");
      const database = new URL(authDbUrl).pathname.replace(/^\//, "") || "asena";
      const mongo = createMongoStore({ db: { uri: authDbUrl, database } });
      return createStore({ backends: { mongo }, providers: providers("mongo") });
    }
    default: {
      const { createSqliteStore } = await import("@zapo-js/store-sqlite");
      await mkdir(config.database.dataDir, { recursive: true });
      const sqlite = createSqliteStore({ path: config.database.sessionFile, driver: "auto" });
      return createStore({ backends: { sqlite }, providers: providers("sqlite") });
    }
  }
}

export async function openSessionStore(): Promise<WaStore> {
  if (!store) {
    store = await buildStore();
    cleanup = () => store!.destroy();
  }
  return store;
}

export async function hasSavedLogin(): Promise<boolean> {
  const current = await openSessionStore();
  const credentials = await current.session(SESSION_ID).auth.load();
  return Boolean(credentials?.meJid);
}

export async function clearSavedLogin(): Promise<void> {
  const current = await openSessionStore();
  const session = current.session(SESSION_ID);
  for (const domain of PERSISTENT_DOMAINS) {
    await session[domain].clear();
  }
}

export async function closeSessionStore(): Promise<void> {
  await cleanup?.();
  store = null;
  cleanup = null;
}
