import { stat } from "node:fs/promises";
import { config } from "../config.ts";
import { command } from "../core/command.ts";
import { formatDuration } from "../lib/format.ts";
import { assertVideoSize } from "../lib/media.ts";
import {
  downloadMp3,
  downloadMp4,
  findVideo,
  queryOf,
  queuedDownload,
  searchVideos,
  sendAudio,
  youtubeLogin,
  youtubeLoginState,
  youtubeLogout,
} from "../lib/youtube.ts";


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
  aliases: ["play", "song", "yta"],
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
  aliases: ["video", "ytv"],
  description: "YouTube video",
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

command({
  name: "yts",
  description: "Search YouTube",
  category: "media",
  usage: "<search>",
  flag: "ytdl",
  run: async (ctx) => {
    const query = queryOf(ctx);
    if (!query) {
      await ctx.replyFail(`Usage: \`${config.prefix}yts burna boy\``);
      return;
    }
    const videos = await ctx.withTyping(() => searchVideos(query, 8));
    if (videos.length === 0) {
      await ctx.reply("No results.");
      return;
    }
    const lines = videos.map((video, i) => `${i + 1}. *${video.title}*\n   ${video.author} · ${formatDuration(video.duration)}\n   ${video.url}`);
    await ctx.reply(`*YouTube: ${query}*\n\n${lines.join("\n\n")}\n\n_\`${config.prefix}song <link>\` or \`${config.prefix}video <link>\` to download._`);
  },
});

command({
  name: "ytlogin",
  description: "Log the bot into YouTube so downloads work on servers",
  category: "owner",
  usage: "[status | logout]",
  permission: "owner",
  run: async (ctx) => {
    const action = ctx.args.toLowerCase();
    if (action === "status") {
      const state = await youtubeLoginState();
      await ctx.reply(state === "cookie" ? "YouTube: using YT_COOKIE." : state === "account" ? "YouTube: logged in." : "YouTube: not logged in.");
      return;
    }
    if (action === "logout") {
      await youtubeLogout();
      await ctx.replyOk("Logged out of YouTube.");
      return;
    }
    try {
      await youtubeLogin(async (url, code) => {
        await ctx.reply(`*YouTube login*\n1. Open ${url}\n2. Enter this code: *${code}*\n3. Pick a Google account (a spare one is best).\n\n_The code expires in a few minutes._`);
      });
      await ctx.replyOk("Logged in to YouTube. Downloads will use this account.");
    } catch (error) {
      await ctx.replyFail(`YouTube login failed: ${error instanceof Error ? error.message : error}`);
    }
  },
});
