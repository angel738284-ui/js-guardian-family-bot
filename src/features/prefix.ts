import { setPrefix } from "../config.ts";
import { kv } from "../db/kv.ts";

export async function loadPrefix(): Promise<void> {
  const saved = await kv.get<string>("prefix");
  if (saved) setPrefix(saved);
}

export async function savePrefix(prefix: string): Promise<void> {
  if (!prefix || prefix.length > 3 || /\s/.test(prefix)) throw new Error("Use 1 to 3 characters without spaces, like . or !");
  await kv.set("prefix", prefix);
  setPrefix(prefix);
}
