import { config } from "../config.ts";
import { command } from "../core/command.ts";
import { AUDIO_EFFECTS } from "../lib/constants.ts";
import { audioEffect, audioToVideo, circleImage, compressVideo, cutMedia, rotateVideo } from "../lib/effects.ts";
import { getStickerPack, sendSticker } from "../lib/sticker.ts";

// One command per audio effect: #bass, #deep, #nightcore, ...
for (const [name, effect] of Object.entries(AUDIO_EFFECTS)) {
  command({
    name,
    description: `${effect.description} (reply to audio or video)`,
    category: "media",
    usage: "(reply to an audio, voice note or video)",
    flag: "media",
    run: async (ctx) => {
      const media = await ctx.downloadMedia();
      if (!media || (media.type !== "audio" && media.type !== "video")) {
        await ctx.replyFail("Reply to an audio, voice note or video.");
        return;
      }
      const result = await ctx.withTyping(() => audioEffect(media.bytes, media.mimetype, effect.filter));
      await ctx.send({ type: "audio", media: result, mimetype: "audio/mpeg" });
    },
  });
}

command({
  name: "cut",
  aliases: ["trim"],
  description: "Cut part of an audio or video",
  category: "media",
  usage: "<start seconds> <length seconds> (reply to audio or video)",
  flag: "media",
  run: async (ctx) => {
    const [start, length] = ctx.args.split(/\s+/).map(Number);
    const media = await ctx.downloadMedia();
    if (!media || (media.type !== "audio" && media.type !== "video") || !Number.isFinite(start) || !length || length <= 0) {
      await ctx.replyFail(`Reply to audio or video with \`${config.prefix}cut 10 30\` (start at 10s, keep 30s).`);
      return;
    }
    const isVideo = media.type === "video";
    const result = await ctx.withTyping(() => cutMedia(media.bytes, media.mimetype, start!, length, isVideo));
    await ctx.send(isVideo ? { type: "video", media: result, mimetype: "video/mp4" } : { type: "audio", media: result, mimetype: "audio/mpeg" });
  },
});

command({
  name: "rotate",
  description: "Rotate or flip a video",
  category: "media",
  usage: "left | right | flip (reply to a video)",
  flag: "media",
  run: async (ctx) => {
    const how = ctx.args.toLowerCase();
    const media = await ctx.downloadMedia();
    if (!media || media.type !== "video" || !["left", "right", "flip"].includes(how)) {
      await ctx.replyFail(`Reply to a video with \`${config.prefix}rotate left | right | flip\`.`);
      return;
    }
    const result = await ctx.withTyping(() => rotateVideo(media.bytes, media.mimetype, how as "left" | "right" | "flip"));
    await ctx.send({ type: "video", media: result, mimetype: "video/mp4" });
  },
});

command({
  name: "compress",
  description: "Make a video smaller (480p)",
  category: "media",
  usage: "(reply to a video)",
  flag: "media",
  run: async (ctx) => {
    const media = await ctx.downloadMedia();
    if (!media || media.type !== "video") {
      await ctx.replyFail("Reply to a video.");
      return;
    }
    const result = await ctx.withTyping(() => compressVideo(media.bytes, media.mimetype));
    await ctx.send({ type: "video", media: result, mimetype: "video/mp4", caption: `${(media.bytes.length / 1e6).toFixed(1)} MB → ${(result.length / 1e6).toFixed(1)} MB` });
  },
});

command({
  name: "black",
  aliases: ["avec"],
  description: "Turn audio into a video with a black screen",
  category: "media",
  usage: "(reply to audio)",
  flag: "media",
  run: async (ctx) => {
    const media = await ctx.downloadMedia();
    if (!media || media.type !== "audio") {
      await ctx.replyFail("Reply to an audio or voice note.");
      return;
    }
    const result = await ctx.withTyping(() => audioToVideo(media.bytes, media.mimetype, "black"));
    await ctx.send({ type: "video", media: result, mimetype: "video/mp4" });
  },
});

command({
  name: "waves",
  aliases: ["histo", "vector"],
  description: "Turn audio into a video of its sound waves",
  category: "media",
  usage: "(reply to audio)",
  flag: "media",
  run: async (ctx) => {
    const media = await ctx.downloadMedia();
    if (!media || media.type !== "audio") {
      await ctx.replyFail("Reply to an audio or voice note.");
      return;
    }
    const result = await ctx.withTyping(() => audioToVideo(media.bytes, media.mimetype, "waves"));
    await ctx.send({ type: "video", media: result, mimetype: "video/mp4" });
  },
});

command({
  name: "circle",
  description: "Round sticker from an image",
  category: "media",
  usage: "(reply to an image)",
  flag: "stickers",
  run: async (ctx) => {
    const media = await ctx.downloadMedia();
    if (!media || (media.type !== "image" && media.type !== "sticker")) {
      await ctx.replyFail("Reply to an image.");
      return;
    }
    const { pack, author } = await getStickerPack();
    await sendSticker(ctx, await circleImage(media.bytes), pack, author);
  },
});
