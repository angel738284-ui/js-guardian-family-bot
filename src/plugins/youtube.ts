import { stat } from "node:fs/promises";
import { config } from "../config.ts";
import { command } from "../core/command.ts";
import { formatDuration } from "../lib/format.ts";
import { assertVideoSize } from "../lib/media.ts";
import { downloadMp3, downloadMp4, findVideo, queryOf, queuedDownload, sendAudio } from "../lib/youtube.ts";


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
          `\`${config.prefix}yt <link|search>\` – details\n` +
          `\`${config.prefix}ytmp3 <link|search>\` – audio\n` +
          `\`${config.prefix}ytmp4 <link|search>\` – video up to 720p\n` +
          `\`${config.prefix}play <search>\` – search and send audio\n\n` +
          `_Limits: ${config.limits.maxAudioSeconds / 60} min audio, ${config.limits.maxVideoSeconds / 60} min video. Needs FFmpeg._`,
      );
      return;
    }
    const video = await findVideo(query);
    await ctx.reply(
      `*${video.title}*\n${video.author} · ${formatDuration(video.duration)}\n${video.url}\n\n` +
        `Use \`${config.prefix}ytmp3\` or \`${config.prefix}ytmp4\` to download.`,
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
      await ctx.replyFail(`Usage: \`${config.prefix}${ctx.command} <link|search>\``);
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
      await ctx.replyFail(`Usage: \`${config.prefix}ytmp4 <link|search>\``);
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
