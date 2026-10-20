import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { config } from "../config.ts";
import { command } from "../core/command.ts";
import { escapeXml, wrapText } from "../lib/format.ts";
import { userPart } from "../lib/jid.ts";
import { assertAudioSize, convertToMp3, detectMime, runFfmpeg, tempPath, withTempFiles } from "../lib/media.ts";
import { svgToWebp } from "../lib/sticker.ts";

const p = config.prefix;

command({
  name: "tomp3",
  description: "Convert a video or audio to MP3",
  category: "media",
  usage: "(reply to a video/audio)",
  flag: "media",
  run: async (ctx) => {
    const media = await ctx.downloadMedia();
    if (!media || (media.type !== "video" && media.type !== "audio")) {
      await ctx.replyFail("Reply to a video or audio.");
      return;
    }

    await ctx.withTyping(() =>
      withTempFiles(async (track) => {
        const input = track(tempPath(media.type === "video" ? ".mp4" : ".audio"));
        await Bun.write(input, media.bytes);
        const mp3 = track(await convertToMp3(input));
        assertAudioSize((await stat(mp3)).size);
        await ctx.send({ type: "audio", media: mp3, mimetype: "audio/mpeg" });
      }),
    );
  },
});

command({
  name: "tourl",
  aliases: ["url"],
  description: "Upload media, get a link",
  category: "media",
  usage: "(reply to media)",
  flag: "media",
  run: async (ctx) => {
    const media = await ctx.downloadMedia();
    if (!media) {
      await ctx.replyFail("Reply to an image, video, audio or document.");
      return;
    }

    await ctx.withTyping(async () => {
      const ext = (await detectMime(media.bytes))?.ext ?? "bin";
      const form = new FormData();
      form.append("reqtype", "fileupload");
      form.append("fileToUpload", new Blob([media.bytes]), `upload.${ext}`);

      const response = await fetch("https://catbox.moe/user/api.php", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(90_000),
      });
      const link = (await response.text()).trim();
      if (!response.ok || !link.startsWith("http")) throw new Error(`Upload failed: ${link.slice(0, 100)}`);

      await ctx.reply(link);
    });
  },
});

command({
  name: "quote",
  description: "Quote sticker from text",
  category: "media",
  usage: "<text> (or reply to a message)",
  flag: "stickers",
  run: async (ctx) => {
    const text = (ctx.args || ctx.message.quoted?.text || "").trim().slice(0, 200);
    if (!text) {
      await ctx.replyFail(`Usage: \`${p}quote <text>\` or reply to a message`);
      return;
    }

    const author = ctx.message.quoted && !ctx.args ? userPart(ctx.message.quoted.sender) || "User" : ctx.pushName || "User";
    const lines = wrapText(text, 28).slice(0, 10);
    const textLines = lines
      .map((line, index) => `<tspan x="40" dy="${index === 0 ? 0 : 34}">${escapeXml(line)}</tspan>`)
      .join("");

    const svg = `
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="32" fill="#1f2c34"/>
  <text x="40" y="80" font-size="28" font-weight="700" fill="#53bdeb" font-family="Arial, sans-serif">${escapeXml(author.slice(0, 24))}</text>
  <text x="40" y="140" font-size="26" fill="#e9edef" font-family="Arial, sans-serif">${textLines}</text>
</svg>`;

    await ctx.send({ type: "sticker", media: await svgToWebp(svg), mimetype: "image/webp" });
  },
});

const FANCY_STYLES: { name: string; upper: number; lower: number }[] = [
  { name: "bold", upper: 0x1d400, lower: 0x1d41a },
  { name: "italic", upper: 0x1d434, lower: 0x1d44e },
  { name: "bubble", upper: 0x24b6, lower: 0x24d0 },
  { name: "script", upper: 0x1d4d0, lower: 0x1d4ea },
  { name: "monospace", upper: 0x1d670, lower: 0x1d68a },
];

function styleText(text: string, upper: number, lower: number): string {
  return [...text]
    .map((char) => {
      const code = char.codePointAt(0)!;
      if (code >= 65 && code <= 90) return String.fromCodePoint(upper + code - 65);
      if (code >= 97 && code <= 122) return String.fromCodePoint(lower + code - 97);
      return char;
    })
    .join("");
}

command({
  name: "fancy",
  description: "Write text in fancy unicode styles",
  category: "tools",
  usage: "<text>",
  run: async (ctx) => {
    const text = (ctx.args || ctx.message.quoted?.text || "").trim().slice(0, 80);
    if (!text) {
      await ctx.replyFail(`Usage: \`${p}fancy <text>\``);
      return;
    }
    await ctx.reply(FANCY_STYLES.map((style) => `*${style.name}*\n${styleText(text, style.upper, style.lower)}`).join("\n\n"));
  },
});

command({
  name: "tts",
  description: "Text to speech voice note",
  category: "media",
  usage: "[lang:] <text>",
  flag: "media",
  run: async (ctx) => {
    let text = (ctx.args || ctx.message.quoted?.text || "").trim();
    let lang = "en";
    const withLang = text.match(/^([a-z]{2}(?:-[a-z]{2})?)\s*[:|]\s*([\s\S]+)$/i);
    if (withLang) {
      lang = withLang[1]!.toLowerCase();
      text = withLang[2]!;
    }
    if (!text) {
      await ctx.replyFail(`Usage: \`${p}tts hello\` or \`${p}tts fr: bonjour\``);
      return;
    }

    const url =
      `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob` +
      `&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text.slice(0, 200))}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Text-to-speech failed (HTTP ${response.status}).`);

    const audio = new Uint8Array(await response.arrayBuffer());
    await ctx.send({ type: "audio", media: audio, mimetype: "audio/mpeg", ptt: true });
  },
});

function textStickerSvg(text: string, color: string): string {
  return `
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
    font-size="64" font-weight="700" fill="${color}" stroke="#000000" stroke-width="6"
    paint-order="stroke" font-family="Arial Black, Arial, sans-serif">${escapeXml(text)}</text>
</svg>`;
}

command({
  name: "ttp",
  description: "Text to sticker",
  category: "media",
  usage: "<text>",
  flag: "stickers",
  run: async (ctx) => {
    const text = (ctx.args || ctx.message.quoted?.text || "").trim().slice(0, 40);
    if (!text) {
      await ctx.replyFail(`Usage: \`${p}ttp <text>\``);
      return;
    }
    await ctx.send({ type: "sticker", media: await svgToWebp(textStickerSvg(text, "#ffffff")), mimetype: "image/webp" });
  },
});

command({
  name: "attp",
  description: "Animated rainbow text sticker",
  category: "media",
  usage: "<text>",
  flag: "stickers",
  run: async (ctx) => {
    const text = (ctx.args || ctx.message.quoted?.text || "").trim().slice(0, 40);
    if (!text) {
      await ctx.replyFail(`Usage: \`${p}attp <text>\``);
      return;
    }

    const colors = ["#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#0066ff", "#ff00ff"];
    const folder = tempPath();
    await mkdir(folder, { recursive: true });
    try {
      for (const [index, color] of colors.entries()) {
        await sharp(Buffer.from(textStickerSvg(text, color)))
          .png()
          .toFile(path.join(folder, `frame${index}.png`));
      }
      const output = path.join(folder, "out.webp");
      await runFfmpeg(["-framerate", "8", "-i", path.join(folder, "frame%d.png"), "-c:v", "libwebp", "-loop", "0", output]);
      await ctx.send({ type: "sticker", media: new Uint8Array(await readFile(output)), mimetype: "image/webp" });
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
});

command({
  name: "removebg",
  description: "Remove an image background",
  category: "media",
  usage: "(reply to an image)",
  flag: "media",
  run: async (ctx) => {
    if (!config.removeBgApiKey) {
      await ctx.replyFail("Set `REMOVEBG_API_KEY` in .env to use this command.");
      return;
    }
    const media = await ctx.downloadMedia();
    if (!media || media.type !== "image") {
      await ctx.replyFail("Reply to an image.");
      return;
    }

    await ctx.withTyping(async () => {
      const form = new FormData();
      form.append("size", "auto");
      form.append("image_file", new Blob([media.bytes]), "image.png");

      const response = await fetch("https://api.remove.bg/v1.0/removebg", {
        method: "POST",
        headers: { "X-Api-Key": config.removeBgApiKey },
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`remove.bg error ${response.status}: ${(await response.text()).slice(0, 150)}`);

      const png = new Uint8Array(await response.arrayBuffer());
      await ctx.send({ type: "image", media: png, mimetype: "image/png", caption: "Background removed" });
    });
  },
});
