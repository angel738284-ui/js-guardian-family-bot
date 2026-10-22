import sharp from "sharp";
import { config } from "../config.ts";
import { command } from "../core/command.ts";
import { kv } from "../db/kv.ts";
import { getStickerPack, imageToWebp, sendSticker, videoToWebp } from "../lib/sticker.ts";

command({
  name: "sticker",
  aliases: ["s"],
  description: "Image or video to sticker",
  category: "media",
  usage: "(send or reply to an image/video)",
  flag: "stickers",
  run: async (ctx) => {
    await ctx.withTyping(async () => {
      const media = await ctx.downloadMedia();
      if (!media || !["image", "video", "sticker"].includes(media.type)) {
        await ctx.replyFail(`Send or reply to an image/video with \`${config.prefix}sticker\``);
        return;
      }

      const webp =
        media.type === "sticker" ? media.bytes : media.type === "video" ? await videoToWebp(media.bytes) : await imageToWebp(media.bytes);

      const { pack, author } = await getStickerPack();
      await sendSticker(ctx, webp, pack, author);
    });
  },
});

command({
  name: "take",
  aliases: ["steal"],
  description: "Re-label a sticker",
  category: "media",
  usage: "[Pack|Author] (reply to a sticker)",
  flag: "stickers",
  run: async (ctx) => {
    if (ctx.message.quoted?.type !== "sticker") {
      await ctx.replyFail("Reply to a sticker.");
      return;
    }
    const media = await ctx.downloadMedia();
    if (!media) {
      await ctx.replyFail("Could not download the sticker.");
      return;
    }

    const defaults = await getStickerPack();
    const [pack, author] = ctx.args.split("|").map((part) => part.trim());
    await sendSticker(ctx, media.bytes, pack || defaults.pack, author || defaults.author);
  },
});

command({
  name: "toimg",
  description: "Turn a sticker back into an image",
  category: "media",
  usage: "(reply to a sticker)",
  flag: "stickers",
  run: async (ctx) => {
    if (ctx.message.quoted?.type !== "sticker") {
      await ctx.replyFail("Reply to a sticker.");
      return;
    }
    const media = await ctx.downloadMedia();
    if (!media) {
      await ctx.replyFail("Could not download the sticker.");
      return;
    }
    const png = await sharp(media.bytes).png().toBuffer();
    await ctx.send({ type: "image", media: new Uint8Array(png), mimetype: "image/png" });
  },
});

command({
  name: "exif",
  aliases: ["stpack"],
  description: "Default sticker pack info",
  category: "owner",
  usage: "Pack|Author",
  permission: "sudo",
  run: async (ctx) => {
    const current = await getStickerPack();
    if (!ctx.args) {
      await ctx.reply(`*Sticker info*\nPack: ${current.pack}\nAuthor: ${current.author}\n\nUsage: \`${config.prefix}exif Pack|Author\``);
      return;
    }

    const [pack, author] = ctx.args.split("|").map((part) => part.trim());
    if (pack) await kv.set("sticker_packname", pack);
    if (author) await kv.set("sticker_author", author);
    await ctx.replyOk(`Pack: *${pack || current.pack}* · Author: *${author || current.author}*`);
  },
});
