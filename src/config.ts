import path from "node:path";

function text(name: string, fallback = ""): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

function number(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function phoneList(name: string): string[] {
  return text(name)
    .split(",")
    .map((item) => item.replace(/\D/g, ""))
    .filter((item) => item.length > 0);
}

export type AuthDb = "sqlite" | "postgres" | "redis" | "mongodb";
const AUTH_DBS: AuthDb[] = ["sqlite", "postgres", "redis", "mongodb"];

const sessionId = text("SESSION_ID");
const legacyUrl = text("DATABASE_URL");
const requestedDb = text("AUTH_DB", /^postgres(ql)?:\/\//i.test(legacyUrl) ? "postgres" : "sqlite").toLowerCase();
if (!AUTH_DBS.includes(requestedDb as AuthDb)) {
  throw new Error(`AUTH_DB must be one of: ${AUTH_DBS.join(", ")}`);
}
const authDb: AuthDb = sessionId ? "sqlite" : (requestedDb as AuthDb);
const authDbUrl = text("AUTH_DB_URL", legacyUrl);
if (authDb !== "sqlite" && !authDbUrl) {
  throw new Error(`AUTH_DB=${authDb} needs AUTH_DB_URL.`);
}
const dataDir = path.resolve(text("DATA_DIR", "./data"));

export const config = {
  botName: "Asena",
  version: "1.0.0",
  prefix: text("PREFIX", "#"),

  owners: phoneList("OWNER_NUMBER"),
  sudo: phoneList("SUDO"),

  defaultMode: text("BOT_MODE", "public").toLowerCase() === "private" ? "private" : "public",
  defaultLang: text("BOT_LANG", "en").toLowerCase(),

  pairingNumber: text("PAIRING_NUMBER").replace(/\D/g, ""),

  sessionId,
  sessionServer: text("ASENA_SERVER", "https://api.asena.fun"),
  sessionSyncMs: number("SESSION_SYNC_SECONDS", 20) * 1000,
  sessionHeartbeatMs: number("SESSION_HEARTBEAT_SECONDS", 30) * 1000,

  port: number("PORT", 0),
  publicUrl: text("PUBLIC_URL", text("RENDER_EXTERNAL_URL")),

  database: {
    authDb,
    authDbUrl,
    usePostgres: authDb === "postgres",
    postgresUrl: authDb === "postgres" ? authDbUrl : "",
    dataDir,
    sessionFile: path.join(dataDir, "session.db"),
    botFile: path.join(dataDir, "bot.db"),
  },

  sticker: {
    packName: text("STICKER_PACKNAME", "Asena"),
    author: text("STICKER_AUTHOR", "Asena"),
  },

  removeBgApiKey: text("REMOVEBG_API_KEY"),

  ai: {
    url: text("AI_URL", sessionId ? "https://utils.asena.fun" : "").replace(/\/+$/, ""),
    key: text("AI_KEY"),
    name: text("AI_NAME", "Asena"),
  },

  enableEval: text("ENABLE_EVAL").toLowerCase() === "true",

  logLevel: text("LOG_LEVEL", "info"),
  zapoLogLevel: text("ZAPO_LOG_LEVEL", "error"),

  jobConcurrency: number("JOB_CONCURRENCY", 1),
  errorAlertThreshold: number("ERROR_ALERT_THRESHOLD", 8),
  tenantId: text("TENANT_ID", "default"),

  adminHttp: {
    port: number("ADMIN_HTTP_PORT", 0),
    host: text("ADMIN_HTTP_HOST", "127.0.0.1"),
    token: text("ADMIN_HTTP_TOKEN"),
  },

  limits: {
    maxAudioBytes: 15 * 1024 * 1024,
    maxVideoBytes: 60 * 1024 * 1024,
    maxAudioSeconds: 15 * 60,
    maxVideoSeconds: 10 * 60,
    maxStickerVideoSeconds: 10,
  },
} as const;
