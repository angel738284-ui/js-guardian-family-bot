import sharp from "sharp";
import { runFfmpeg, tempPath, withTempFiles } from "./media.ts";

function extensionOf(mimetype: string): string {
  const sub = mimetype.split("/")[1]?.split(";")[0] ?? "bin";
  return `.${sub.replace("mpeg", "mp3").replace("quicktime", "mov")}`;
}

// Writes the input to a temp file, runs ffmpeg with the given arguments, and returns the output bytes.
async function transform(input: Uint8Array, mimetype: string, outExtension: string, args: (inPath: string, outPath: string) => string[]): Promise<Uint8Array> {
  return withTempFiles(async (track) => {
    const inPath = track(tempPath(extensionOf(mimetype)));
    const outPath = track(tempPath(outExtension));
    await Bun.write(inPath, input);
    await runFfmpeg(args(inPath, outPath));
    return Bun.file(outPath).bytes();
  });
}

export function audioEffect(input: Uint8Array, mimetype: string, filter: string): Promise<Uint8Array> {
  return transform(input, mimetype, ".mp3", (i, o) => ["-i", i, "-vn", "-af", filter, "-c:a", "libmp3lame", "-b:a", "128k", o]);
}

export function cutMedia(input: Uint8Array, mimetype: string, start: number, seconds: number, isVideo: boolean): Promise<Uint8Array> {
  const out = isVideo ? ".mp4" : ".mp3";
  return transform(input, mimetype, out, (i, o) => ["-ss", String(start), "-t", String(seconds), "-i", i, ...(isVideo ? ["-c:v", "libx264", "-c:a", "aac"] : ["-vn", "-c:a", "libmp3lame"]), o]);
}

export function rotateVideo(input: Uint8Array, mimetype: string, how: "left" | "right" | "flip"): Promise<Uint8Array> {
  const filter = how === "left" ? "transpose=2" : how === "right" ? "transpose=1" : "hflip";
  return transform(input, mimetype, ".mp4", (i, o) => ["-i", i, "-vf", filter, "-c:a", "copy", o]);
}

export function compressVideo(input: Uint8Array, mimetype: string): Promise<Uint8Array> {
  return transform(input, mimetype, ".mp4", (i, o) => ["-i", i, "-vf", "scale=-2:480", "-c:v", "libx264", "-crf", "32", "-preset", "veryfast", "-c:a", "aac", "-b:a", "64k", o]);
}

export function audioToVideo(input: Uint8Array, mimetype: string, style: "black" | "waves"): Promise<Uint8Array> {
  return transform(input, mimetype, ".mp4", (i, o) =>
    style === "black"
      ? ["-f", "lavfi", "-i", "color=c=black:s=640x360", "-i", i, "-shortest", "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", o]
      : ["-i", i, "-filter_complex", "[0:a]showwaves=s=640x360:mode=cline:colors=0x25D366[v]", "-map", "[v]", "-map", "0:a", "-c:v", "libx264", "-c:a", "aac", "-pix_fmt", "yuv420p", o],
  );
}

export function gifToMp4(input: Uint8Array): Promise<Uint8Array> {
  return transform(input, "image/gif", ".mp4", (i, o) => ["-i", i, "-movflags", "faststart", "-pix_fmt", "yuv420p", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", o]);
}

export async function circleImage(input: Uint8Array): Promise<Uint8Array> {
  const size = 512;
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></svg>`);
  const png = await sharp(input).resize(size, size, { fit: "cover" }).composite([{ input: mask, blend: "dest-in" }]).webp().toBuffer();
  return new Uint8Array(png);
}
