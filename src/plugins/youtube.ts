import { stat } from "node:fs/promises";
import { config } from "../config.ts";
import { command } from "../core/command.ts";
import type { Ctx } from "../core/context.ts";
import { enqueueJob } from "../features/queue.ts";
import { formatDuration } from "../lib/format.ts";
import { assertAudioSize, assertVideoSize, removeFile, runFfmpeg, tempPath } from "../lib/media.ts";

const p = config.prefix;

const STREAM_CLIENTS = ["IOS", "ANDROID", "TV", "MWEB"] as const;
const STREAM_HEADERS = { accept: "*/*", origin: "https://www.youtube.com", referer: "https://www.youtube.com" };
const CHUNK_BYTES = 10 * 1024 * 1024;

// The youtubei.js types are very large; we only describe the fields we use.
interface Format {
  itag: number;
  url?: string;
  mime_type?: string;
  bitrate?: number;
  height?: number;
  has_audio: boolean;
  has_video: boolean;
  content_length?: number;
}
interface VideoInfo {
  basic_info: { id?: string; title?: string; duration?: number; author?: string };
  streaming_data?: { formats?: Format[]; adaptive_formats?: Format[] };
  cpn?: string;
}
interface Innertube {
  getBasicInfo(id: string, options?: { client?: string }): Promise<VideoInfo>;
  search(query: string, filters: { type: "video" }): Promise<{ videos?: { id?: string }[] }>;
}

let youtube: Innertube | null = null;

async function getYoutube(): Promise<Innertube> {
  if (!youtube) {
    const { Innertube } = await import("youtubei.js");
    // retrieve_player: false — we only use clients that send plain URLs, no deciphering needed.
    youtube = (await Innertube.create({ retrieve_player: false })) as unknown as Innertube;
  }
  return youtube;
}

function extractVideoId(input: string): string | null {
  const match =
    input.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/) ??
    input.trim().match(/^([\w-]{11})$/);
  return match?.[1] ?? null;
}

interface VideoMeta {
  id: string;
  title: string;
  author: string;
  duration: number;
  url: string;
}

async function findVideo(query: string): Promise<VideoMeta> {
  const yt = await getYoutube();
  let id = extractVideoId(query);
  if (!id) {
    const results = await yt.search(query, { type: "video" });
    id = results.videos?.find((video) => video.id)?.id ?? null;
  }
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

function directFormats(info: VideoInfo): Format[] {
  const all = [...(info.streaming_data?.formats ?? []), ...(info.streaming_data?.adaptive_formats ?? [])];
  return all.filter((format) => format.url?.startsWith("http"));
}

function bestAudio(formats: Format[]): Format | null {
  const audio = formats.filter((f) => f.has_audio && !f.has_video).sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0));
  return audio.find((f) => /mp4/i.test(f.mime_type ?? "")) ?? audio[0] ?? null;
}

function bestVideo(formats: Format[], withAudio: boolean, maxHeight = 720): Format | null {
  const candidates = formats.filter((f) => f.has_video && f.has_audio === withAudio);
  const capped = candidates.filter((f) => (f.height ?? 0) <= maxHeight);
  const pool = (capped.length ? capped : candidates).sort(
    (a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.bitrate ?? 0) - (a.bitrate ?? 0),
  );
  return pool.find((f) => /mp4|avc1/i.test(f.mime_type ?? "")) ?? pool[0] ?? null;
}

async function downloadStream(info: VideoInfo, format: Format, extension: string): Promise<string> {
  let url = format.url!;
  if (info.cpn && !/[?&]cpn=/.test(url)) url += `&cpn=${info.cpn}`;

  let total = Number(format.content_length) || 0;
  if (!total) {
    const probe = await fetch(`${url}&range=0-1023`, { headers: STREAM_HEADERS });
    total = Number(probe.headers.get("content-range")?.split("/")[1] ?? 0);
    await probe.arrayBuffer();
  }

  const filePath = tempPath(extension);
  const file = Bun.file(filePath).writer();
  try {
    if (total > 0) {
      for (let start = 0; start < total; start += CHUNK_BYTES) {
        const end = Math.min(start + CHUNK_BYTES, total) - 1;
        const response = await fetch(`${url}&range=${start}-${end}`, { headers: STREAM_HEADERS });
        if (!response.ok) throw new Error(`YouTube refused the download (HTTP ${response.status}).`);
        file.write(new Uint8Array(await response.arrayBuffer()));
      }
    } else {
      const response = await fetch(url, { headers: STREAM_HEADERS });
      if (!response.ok) throw new Error(`YouTube refused the download (HTTP ${response.status}).`);
      file.write(new Uint8Array(await response.arrayBuffer()));
    }
    await file.end();
    return filePath;
  } catch (error) {
    await file.end();
    await removeFile(filePath);
    throw error;
  }
}

async function tryEachClient(videoId: string, attempt: (info: VideoInfo, formats: Format[]) => Promise<string | null>): Promise<string> {
  const yt = await getYoutube();
  let lastError: unknown = null;

  for (const client of STREAM_CLIENTS) {
    try {
      const info = await yt.getBasicInfo(videoId, { client });
      const formats = directFormats(info);
      if (formats.length === 0) continue;
      const result = await attempt(info, formats);
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("YouTube did not give a downloadable stream for this video. Try another one or later.");
}

async function downloadMp3(video: VideoMeta): Promise<string> {
  if (video.duration > config.limits.maxAudioSeconds) {
    throw new Error(`Too long (max ${config.limits.maxAudioSeconds / 60} minutes for audio).`);
  }

  const raw = await tryEachClient(video.id, async (info, formats) => {
    const format = bestAudio(formats) ?? bestVideo(formats, true);
    return format ? downloadStream(info, format, ".audio") : null;
  });

  const mp3 = tempPath(".mp3");
  try {
    await runFfmpeg(["-i", raw, "-vn", "-c:a", "libmp3lame", "-b:a", "128k", mp3]);
    return mp3;
  } catch (error) {
    await removeFile(mp3);
    throw error;
  } finally {
    await removeFile(raw);
  }
}

async function downloadMp4(video: VideoMeta): Promise<string> {
  if (video.duration > config.limits.maxVideoSeconds) {
    throw new Error(`Too long (max ${config.limits.maxVideoSeconds / 60} minutes for video).`);
  }

  return tryEachClient(video.id, async (info, formats) => {
    const videoOnly = bestVideo(formats, false);
    const audioOnly = bestAudio(formats);
    if (videoOnly && audioOnly) {
      const videoPath = await downloadStream(info, videoOnly, ".video");
      const audioPath = await downloadStream(info, audioOnly, ".audio").catch(() => null);
      const output = tempPath(".mp4");
      try {
        if (audioPath) {
          // +faststart lets WhatsApp start playing before the whole file is downloaded.
          await runFfmpeg(["-i", videoPath, "-i", audioPath, "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", output]);
          return output;
        }
      } catch {
        await removeFile(output);
      } finally {
        await removeFile(videoPath);
        await removeFile(audioPath);
      }
    }

    const combined = bestVideo(formats, true);
    return combined ? downloadStream(info, combined, ".mp4") : null;
  });
}

async function sendAudio(ctx: Ctx, filePath: string): Promise<void> {
  assertAudioSize((await stat(filePath)).size);
  await ctx.send({ type: "audio", media: filePath, mimetype: "audio/mpeg" });
}

function queryOf(ctx: Ctx): string {
  return ctx.args || ctx.message.quoted?.text?.trim() || "";
}

async function queuedDownload(ctx: Ctx, name: string, download: () => Promise<string>, deliver: (file: string) => Promise<void>) {
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

command({
  name: "yt",
  aliases: ["ytdl"],
  description: "YouTube video details",
  category: "media",
  usage: "<link|search>",
  flag: "ytdl",
  run: async (ctx) => {
    const query = queryOf(ctx);
    if (!query) {
      await ctx.reply(
        `*YouTube*\n` +
          `\`${p}yt <link|search>\` – details\n` +
          `\`${p}ytmp3 <link|search>\` – audio\n` +
          `\`${p}ytmp4 <link|search>\` – video up to 720p\n` +
          `\`${p}play <search>\` – search and send audio\n\n` +
          `_Limits: ${config.limits.maxAudioSeconds / 60} min audio, ${config.limits.maxVideoSeconds / 60} min video. Needs FFmpeg._`,
      );
      return;
    }
    const video = await findVideo(query);
    await ctx.reply(
      `*${video.title}*\n${video.author} · ${formatDuration(video.duration)}\n${video.url}\n\n` +
        `Use \`${p}ytmp3\` or \`${p}ytmp4\` to download.`,
    );
  },
});

command({
  name: "ytmp3",
  aliases: ["play"],
  description: "YouTube audio (MP3)",
  category: "media",
  usage: "<link|search>",
  flag: "ytdl",
  run: async (ctx) => {
    const query = queryOf(ctx);
    if (!query) {
      await ctx.replyFail(`Usage: \`${p}${ctx.command} <link|search>\``);
      return;
    }
    const video = await findVideo(query);
    await ctx.reply(`*${video.title}* · ${formatDuration(video.duration)}\n_Downloading…_`);
    await queuedDownload(
      ctx,
      "ytmp3",
      () => downloadMp3(video),
      (file) => sendAudio(ctx, file),
    );
  },
});

command({
  name: "ytmp4",
  description: "YouTube video (720p)",
  category: "media",
  usage: "<link|search>",
  flag: "ytdl",
  run: async (ctx) => {
    const query = queryOf(ctx);
    if (!query) {
      await ctx.replyFail(`Usage: \`${p}ytmp4 <link|search>\``);
      return;
    }
    const video = await findVideo(query);
    await ctx.reply(`*${video.title}* · ${formatDuration(video.duration)}\n_Downloading…_`);
    await queuedDownload(
      ctx,
      "ytmp4",
      () => downloadMp4(video),
      async (file) => {
        assertVideoSize((await stat(file)).size);
        await ctx.send({
          type: "video",
          media: file,
          mimetype: "video/mp4",
          caption: `*${video.title}* · ${formatDuration(video.duration)}\n${video.url}`,
        });
      },
    );
  },
});
