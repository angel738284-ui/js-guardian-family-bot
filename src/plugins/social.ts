import { config } from "../config.ts";
import { command } from "../core/command.ts";
import type { Ctx } from "../core/context.ts";
import { assertAudioSize, assertVideoSize, BROWSER_USER_AGENT, fetchBytes } from "../lib/media.ts";

interface Found {
  urls: string[];
  caption: string;
}

function pickUrl(ctx: Ctx): string {
  const source = ctx.args || ctx.message.quoted?.text || "";
  return source.match(/https?:\/\/\S+/)?.[0] ?? "";
}

async function sendFromUrl(ctx: Ctx, url: string, caption: string): Promise<void> {
  const { bytes, contentType } = await fetchBytes(url, config.limits.maxVideoBytes);

  if (contentType.startsWith("image/") || /\.(jpe?g|png|webp)(\?|$)/i.test(url)) {
    await ctx.send({ type: "image", media: bytes, mimetype: contentType || "image/jpeg", caption });
  } else if (contentType.startsWith("audio/")) {
    assertAudioSize(bytes.length);
    await ctx.send({ type: "audio", media: bytes, mimetype: contentType });
  } else {
    assertVideoSize(bytes.length);
    await ctx.send({ type: "video", media: bytes, mimetype: "video/mp4", caption });
  }
}

async function readOpenGraph(pageUrl: string): Promise<{ video?: string; image?: string; title?: string }> {
  const response = await fetch(pageUrl, {
    headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "text/html" },
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
  });
  const html = await response.text();
  const meta = (name: string) =>
    html.match(new RegExp(`<meta[^>]+property="${name}"[^>]+content="([^"]+)"`, "i"))?.[1]?.replaceAll("&amp;", "&");

  // Facebook also embeds a direct "playable_url" in its page data.
  const playable = html.match(/"playable_url(?:_quality_hd)?"\s*:\s*"([^"]+)"/)?.[1]?.replace(/\\\//g, "/");
  return { video: meta("og:video") ?? meta("og:video:url") ?? playable, image: meta("og:image"), title: meta("og:title") };
}

async function findTikTok(url: string): Promise<Found> {
  const api = `https://www.tikwm.com/api/?hd=1&url=${encodeURIComponent(url)}`;
  const response = await fetch(api, { signal: AbortSignal.timeout(30_000) });
  const json = (await response.json()) as {
    data?: { hdplay?: string; play?: string; images?: string[]; title?: string };
  };
  const data = json.data;
  if (!data) throw new Error("TikTok returned nothing. The free API may be down; try later.");

  const urls = data.images?.length ? data.images.slice(0, 5) : [data.hdplay ?? data.play].filter((u): u is string => Boolean(u));
  if (!urls.length) throw new Error("No downloadable media found in that TikTok.");
  return { urls, caption: data.title || "TikTok" };
}

async function findWithOpenGraph(url: string, site: string): Promise<Found> {
  const page = await readOpenGraph(url);
  const media = page.video ?? page.image;
  if (!media) throw new Error(`Could not get ${site} media. Only public posts work, and ${site} often blocks bots.`);
  return { urls: [media], caption: page.title ?? site };
}

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
