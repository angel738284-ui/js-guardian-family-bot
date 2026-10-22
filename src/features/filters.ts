import type { Ctx } from "../core/context.ts";
import { kv } from "../db/kv.ts";

export interface AudioReply {
  data: string;
  mimetype: string;
  ptt: boolean;
}

export type Scope = "global" | string;

const MAX_AUDIO_BYTES = 2 * 1024 * 1024;

const filtersKey = (scope: Scope) => `filters:${scope}`;
const bgmKey = (scope: Scope) => `bgm:${scope}`;

function matches(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i").test(text);
}

export async function getFilters(scope: Scope): Promise<Record<string, string>> {
  return (await kv.get<Record<string, string>>(filtersKey(scope))) ?? {};
}

export async function setFilter(scope: Scope, word: string, reply: string | null): Promise<void> {
  const filters = await getFilters(scope);
  if (reply === null) delete filters[word.toLowerCase()];
  else filters[word.toLowerCase()] = reply;
  await kv.set(filtersKey(scope), Object.keys(filters).length ? filters : null);
}

export async function getBgm(scope: Scope): Promise<Record<string, AudioReply>> {
  return (await kv.get<Record<string, AudioReply>>(bgmKey(scope))) ?? {};
}

export async function setBgm(scope: Scope, word: string, audio: { bytes: Uint8Array; mimetype: string; ptt: boolean } | null): Promise<void> {
  if (audio && audio.bytes.length > MAX_AUDIO_BYTES) throw new Error("Audio is too big. Keep it under 2 MB.");
  const bgm = await getBgm(scope);
  if (audio) bgm[word.toLowerCase()] = { data: Buffer.from(audio.bytes).toString("base64"), mimetype: audio.mimetype, ptt: audio.ptt };
  else delete bgm[word.toLowerCase()];
  await kv.set(bgmKey(scope), Object.keys(bgm).length ? bgm : null);
}

// Answers a message from the chat's filters first, then global ones. Returns true when it replied.
export async function runFilters(ctx: Ctx): Promise<boolean> {
  if (!ctx.text) return false;

  for (const scope of [ctx.chat, "global"]) {
    const filters = await getFilters(scope);
    const word = Object.keys(filters).find((item) => matches(ctx.text, item));
    if (word) {
      await ctx.reply(filters[word]!);
      return true;
    }

    const bgm = await getBgm(scope);
    const audioWord = Object.keys(bgm).find((item) => matches(ctx.text, item));
    if (audioWord) {
      const audio = bgm[audioWord]!;
      await ctx.send({ type: "audio", media: Buffer.from(audio.data, "base64"), mimetype: audio.mimetype, ptt: audio.ptt });
      return true;
    }
  }
  return false;
}

export async function getStickerCommands(): Promise<Record<string, string>> {
  return (await kv.get<Record<string, string>>("sticker_commands")) ?? {};
}

export async function setStickerCommand(hash: string, commandText: string | null): Promise<void> {
  const commands = await getStickerCommands();
  if (commandText === null) delete commands[hash];
  else commands[hash] = commandText;
  await kv.set("sticker_commands", Object.keys(commands).length ? commands : null);
}

export function stickerHash(content: Ctx["message"]["content"]): string | null {
  const hash = content.stickerMessage?.fileSha256;
  return hash ? Buffer.from(hash).toString("base64") : null;
}
