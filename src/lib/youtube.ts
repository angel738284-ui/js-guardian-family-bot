import { stat } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import type { Innertube, Types } from "youtubei.js";
import { config } from "../config.ts";
import type { Ctx } from "../core/context.ts";
import { kv } from "../db/kv.ts";
import { enqueueJob } from "../features/queue.ts";
import { assertAudioSize, removeFile, runFfmpeg, tempPath } from "./media.ts";

// Tried in order until one gives a stream; different clients get different formats and blocks.
const AUDIO_CLIENTS = ["YTMUSIC", "IOS", "ANDROID", "WEB", "MWEB", "TV"] as const;
const VIDEO_CLIENTS = ["WEB", "MWEB", "ANDROID", "IOS", "TV"] as const;
const EVAL_TIMEOUT_MS = 5_000;
const LOGIN_KEY = "youtube_login";

type YoutubeModule = typeof import("youtubei.js");
type Credentials = Parameters<Innertube["session"]["signIn"]>[0];

let youtube: Innertube | null = null;
let module: YoutubeModule | null = null;

async function loadModule(): Promise<YoutubeModule> {
  if (module) return module;
  module = await import("youtubei.js");
  module.Log.setLevel(module.Log.Level.NONE);
  // YouTube's player code decodes stream URLs; run it in an isolated VM, never in the bot itself.
  module.Platform.shim.eval = (data, env) => {
    const exported = [
      env.n ? `n: exportedVars.nFunction(${JSON.stringify(env.n)})` : "",
      env.sig ? `sig: exportedVars.sigFunction(${JSON.stringify(env.sig)})` : "",
    ].filter(Boolean);
    return runInNewContext(`(() => { ${data.output}\nreturn { ${exported.join(", ")} }; })()`, {}, { timeout: EVAL_TIMEOUT_MS });
  };
  return module;
}

export async function getYoutube(): Promise<Innertube> {
  if (youtube) return youtube;
  const { Innertube, UniversalCache } = await loadModule();
  const yt = await Innertube.create({
    cache: new UniversalCache(false),
    generate_session_locally: true,
    cookie: config.youtubeCookie || undefined,
  });

  const saved = await kv.get<Credentials>(LOGIN_KEY);
  if (saved && !config.youtubeCookie) {
    yt.session.on("update-credentials", ({ credentials }) => void kv.set(LOGIN_KEY, credentials));
    await yt.session.signIn(saved).catch(() => kv.delete(LOGIN_KEY));
  }
  youtube = yt;
  return yt;
}

// Signs in with a Google device code, like a TV. The login is saved and used for every download.
export async function youtubeLogin(onCode: (url: string, code: string) => Promise<void>): Promise<void> {
  const { Innertube, UniversalCache } = await loadModule();
  const yt = await Innertube.create({ cache: new UniversalCache(false), generate_session_locally: true });

  await new Promise<void>((resolve, reject) => {
    yt.session.once("auth-pending", (data) => void onCode(data.verification_url, data.user_code).catch(reject));
    yt.session.once("auth", async ({ credentials }) => {
      await kv.set(LOGIN_KEY, credentials);
      resolve();
    });
    yt.session.once("auth-error", reject);
    yt.session.signIn().catch(reject);
  });
  youtube = null;
}

export async function youtubeLogout(): Promise<void> {
  await kv.delete(LOGIN_KEY);
  youtube = null;
}

export async function youtubeLoginState(): Promise<"cookie" | "account" | "none"> {
  if (config.youtubeCookie) return "cookie";
  return (await kv.get(LOGIN_KEY)) ? "account" : "none";
}

export function extractVideoId(input: string): string | null {
  const match =
    input.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/) ??
    input.trim().match(/^([\w-]{11})$/);
  return match?.[1] ?? null;
}

export interface VideoMeta {
  id: string;
  title: string;
  author: string;
  duration: number;
  url: string;
}

export async function searchVideos(query: string, limit = 5): Promise<VideoMeta[]> {
  const yt = await getYoutube();
  const results = await yt.search(query, { type: "video" });
  return results.videos
    .flatMap((video) => {
      const item = video as unknown as { id?: string; title?: { text?: string }; author?: { name?: string }; duration?: { seconds?: number } };
      if (!item.id) return [];
      return [{
        id: item.id,
        title: item.title?.text ?? "Unknown",
        author: item.author?.name ?? "Unknown",
        duration: item.duration?.seconds ?? 0,
        url: `https://youtu.be/${item.id}`,
      }];
    })
    .slice(0, limit);
}

export async function findVideo(query: string): Promise<VideoMeta> {
  const yt = await getYoutube();
  const id = extractVideoId(query) ?? (await searchVideos(query, 1))[0]?.id;
  if (!id) throw new Error("No results found.");

  const info = await yt.getBasicInfo(id);
  return {
    id,
    title: info.basic_info.title ?? "Unknown",
    author: info.basic_info.author ?? "Unknown",
    duration: info.basic_info.duration ?? 0,
    url: `https://youtu.be/${id}`,
  };
}

async function downloadStream(id: string, type: "audio" | "video+audio", extension: string): Promise<string> {
  const yt = await getYoutube();
  const { Utils } = await loadModule();

  const info = await yt.getBasicInfo(id);
  if (info.playability_status?.status && info.playability_status.status !== "OK") {
    const reason = info.playability_status.reason ?? "YouTube blocked this request.";
    const hint = (await youtubeLoginState()) === "none" ? `\nLog in with \`${config.prefix}ytlogin\` or set YT_COOKIE, then try again.` : "";
    throw new Error(`${reason}${hint}`);
  }

  const clients = type === "audio" ? AUDIO_CLIENTS : VIDEO_CLIENTS;
  let lastError: unknown = null;
  for (const client of clients) {
    const filePath = tempPath(extension);
    try {
      const options: Types.DownloadOptions = { type, quality: "best", format: "mp4", client };
      const stream = await yt.download(id, options);
      const file = Bun.file(filePath).writer();
      for await (const chunk of Utils.streamToIterable(stream)) file.write(chunk);
      await file.end();
      if ((await stat(filePath)).size > 0) return filePath;
    } catch (error) {
      lastError = error;
    }
    await removeFile(filePath);
  }
  throw lastError instanceof Error ? lastError : new Error("YouTube did not give a downloadable stream. Try again later.");
}

export async function downloadMp3(video: VideoMeta): Promise<string> {
  if (video.duration > config.limits.maxAudioSeconds) {
    throw new Error(`Too long (max ${config.limits.maxAudioSeconds / 60} minutes for audio).`);
  }

  const raw = await downloadStream(video.id, "audio", ".m4a");
  const mp3 = tempPath(".mp3");
  try {
    await runFfmpeg(["-i", raw, "-vn", "-c:a", "libmp3lame", "-b:a", "192k", "-ar", "44100", mp3]);
    return mp3;
  } catch (error) {
    await removeFile(mp3);
    throw error;
  } finally {
    await removeFile(raw);
  }
}

export async function downloadMp4(video: VideoMeta): Promise<string> {
  if (video.duration > config.limits.maxVideoSeconds) {
    throw new Error(`Too long (max ${config.limits.maxVideoSeconds / 60} minutes for video).`);
  }
  return downloadStream(video.id, "video+audio", ".mp4");
}

export async function sendAudio(ctx: Ctx, filePath: string): Promise<void> {
  assertAudioSize((await stat(filePath)).size);
  await ctx.send({ type: "audio", media: filePath, mimetype: "audio/mpeg" });
}

export function queryOf(ctx: Ctx): string {
  return ctx.args || ctx.message.quoted?.text?.trim() || "";
}

export async function queuedDownload(ctx: Ctx, name: string, download: () => Promise<string>, deliver: (file: string) => Promise<void>) {
  await ctx.withTyping(() =>
    enqueueJob(name, async () => {
      let file: string | null = null;
      try {
        file = await download();
        await deliver(file);
      } catch (error) {
        await ctx.replyFail(error instanceof Error ? error.message : "YouTube download failed.");
      } finally {
        await removeFile(file);
      }
    }),
  );
}
