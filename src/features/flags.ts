import { kv } from "../db/kv.ts";

const DEFAULT_FLAGS: Record<string, boolean> = {
  media: true,
  ytdl: true,
  social: true,
  stickers: true,
  moderation: true,
  broadcast: true,
  ai: true,
  maintenance: false,
};

export const KNOWN_FLAGS = Object.keys(DEFAULT_FLAGS);

let cache: Record<string, boolean> | null = null;

export async function getFlags(): Promise<Record<string, boolean>> {
  if (!cache) {
    const stored = (await kv.get<Record<string, boolean>>("feature_flags")) ?? {};
    cache = { ...DEFAULT_FLAGS, ...stored };
  }
  return { ...cache };
}

export async function setFlag(name: string, enabled: boolean): Promise<void> {
  const key = name.toLowerCase();
  if (!KNOWN_FLAGS.includes(key)) {
    throw new Error(`Unknown flag "${name}". Known flags: ${KNOWN_FLAGS.join(", ")}`);
  }
  const flags = await getFlags();
  flags[key] = enabled;
  cache = flags;
  await kv.set("feature_flags", flags);
}

export async function isMaintenance(): Promise<boolean> {
  return (await getFlags()).maintenance === true;
}

export async function isFlagOn(name: string): Promise<boolean> {
  return (await getFlags())[name] !== false;
}
