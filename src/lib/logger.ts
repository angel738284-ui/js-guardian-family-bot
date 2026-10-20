import { config } from "../config.ts";

type Level = "error" | "warn" | "info" | "debug";

const RANK: Record<Level, number> = { error: 1, warn: 2, info: 3, debug: 4 };

const currentLevel: Level = config.logLevel in RANK ? (config.logLevel as Level) : "info";

type RemoteSink = (level: "error" | "warn", message: string, detail?: unknown) => void;
let remoteSink: RemoteSink | null = null;

function shouldLog(level: Level): boolean {
  return RANK[level] <= RANK[currentLevel];
}

function stamp(level: Level): string {
  return `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
}

export const logger = {
  setRemoteSink(sink: RemoteSink | null) {
    remoteSink = sink;
  },

  error(message: string, detail?: unknown) {
    if (!shouldLog("error")) return;
    console.error(stamp("error"), message, detail ?? "");
    remoteSink?.("error", message, detail);
  },

  warn(message: string, detail?: unknown) {
    if (!shouldLog("warn")) return;
    console.warn(stamp("warn"), message, detail ?? "");
    remoteSink?.("warn", message, detail);
  },

  info(message: string) {
    if (shouldLog("info")) console.log(stamp("info"), message);
  },

  debug(message: string) {
    if (shouldLog("debug")) console.log(stamp("debug"), message);
  },
};

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
