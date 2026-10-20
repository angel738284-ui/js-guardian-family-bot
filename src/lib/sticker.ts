import { readFile } from "node:fs/promises";
import { config } from "../config.ts";
import { kv } from "../db/kv.ts";
import { runFfmpeg, tempPath, withTempFiles } from "./media.ts";

export async function getStickerPack(): Promise<{ pack: string; author: string }> {
  return {
    pack: (await kv.get<string>("sticker_packname")) ?? config.sticker.packName,
    author: (await kv.get<string>("sticker_author")) ?? config.sticker.author,
  };
}

export async function imageToWebp(bytes: Uint8Array): Promise<Uint8Array> {
  const sharp = (await import("sharp")).default;
  return sharp(bytes)
    .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 80 })
    .toBuffer();
}

export async function videoToWebp(bytes: Uint8Array): Promise<Uint8Array> {
  return withTempFiles(async (track) => {
    const input = track(tempPath(".mp4"));
    const output = track(tempPath(".webp"));
    await Bun.write(input, bytes);
    await runFfmpeg([
      "-t", String(config.limits.maxStickerVideoSeconds),
      "-i", input,
      "-vf", "scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=black@0",
      "-c:v", "libwebp",
      "-loop", "0",
      "-an",
      "-fps_mode", "passthrough",
      output,
    ]);
    return new Uint8Array(await readFile(output));
  });
}

export async function svgToWebp(svg: string): Promise<Uint8Array> {
  const sharp = (await import("sharp")).default;
  return sharp(Buffer.from(svg)).webp({ quality: 90 }).toBuffer();
}

export async function addStickerInfo(webp: Uint8Array, pack: string, author: string): Promise<Uint8Array> {
  const { Image } = await import("node-webpmux");

  const json = Buffer.from(
    JSON.stringify({
      "sticker-pack-id": "com.asena.whatsapp",
      "sticker-pack-name": pack,
      "sticker-pack-publisher": author,
      emojis: [],
    }),
    "utf8",
  );
  // Fixed EXIF header (little-endian TIFF with one custom tag 0x5741) followed by the JSON length.
  const header = Buffer.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16,
    0x00, 0x00, 0x00,
  ]);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(json.length, 0);

  const image = new Image();
  await image.load(Buffer.from(webp));
  image.exif = Buffer.concat([header, length, json]);
  return new Uint8Array(await image.save(null));
}
