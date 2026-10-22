import { config } from "../config.ts";
import { command } from "../core/command.ts";
import { findTikTok, findWithOpenGraph, pickUrl, sendFromUrl, type Found } from "../lib/social.ts";

function downloader(options: {
  name: string;
  aliases?: string[];
  site: string;
  urlPattern: RegExp;
  find: (url: string) => Promise<Found>;
}) {
  command({
    name: options.name,
    aliases: options.aliases,
    description: `${options.site} download`,
    category: "media",
    usage: "<link>",
    flag: "social",
    run: async (ctx) => {
      const url = pickUrl(ctx);
      if (!options.urlPattern.test(url)) {
        await ctx.replyFail(`Usage: \`${config.prefix}${options.name} <${options.site} link>\``);
        return;
      }

      await ctx.withTyping(async () => {
        try {
          const found = await options.find(url);
          for (const mediaUrl of found.urls) await sendFromUrl(ctx, mediaUrl, found.caption);
        } catch (error) {
          await ctx.replyFail(error instanceof Error ? error.message : `${options.site} download failed.`);
        }
      });
    },
  });
}

downloader({ name: "tiktok", aliases: ["tt"], site: "TikTok", urlPattern: /tiktok\.com/i, find: findTikTok });
downloader({
  name: "ig",
  aliases: ["insta"],
  site: "Instagram",
  urlPattern: /instagram\.com/i,
  find: (url) => findWithOpenGraph(url, "Instagram"),
});
downloader({
  name: "fb",
  site: "Facebook",
  urlPattern: /facebook\.com|fb\.watch/i,
  find: (url) => findWithOpenGraph(url, "Facebook"),
});
