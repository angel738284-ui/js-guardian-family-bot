import { unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config } from "../config.ts";
import { formatBytes } from "./format.ts";

export function tempPath(extension = ""): string {
  const ext = extension && !extension.startsWith(".") ? `.${extension}` : extension;
  const random = Math.random().toString(36).slice(2, 8);
  return path.join(os.tmpdir(), `asena-${Date.now()}-${random}${ext}`);
}

export async function removeFile(filePath: string | null | undefined): Promise<void> {
  if (!filePath) return;
  await unlink(filePath).catch(() => {});
}

export async function withTempFiles<T>(work: (track: (filePath: string) => string) => Promise<T>): Promise<T> {
  const files: string[] = [];
  const track = (filePath: string) => {
    files.push(filePath);
    return filePath;
  };

  try {
    return await work(track);
  } finally {
    await Promise.all(files.map(removeFile));
  }
}

export async function runFfmpeg(args: string[]): Promise<void> {
  let child;
  try {
    child = Bun.spawn(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", ...args], {
      stdout: "ignore",
      stderr: "pipe",
    });
  } catch {
    throw new Error("FFmpeg is not installed or not on PATH.");
  }

  const exitCode = await child.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(child.stderr).text();
    const lastLines = stderr.trim().split("\n").slice(-3).join(" ");
    throw new Error(`FFmpeg failed: ${lastLines || `exit code ${exitCode}`}`);
  }
}

export async function hasFfmpeg(): Promise<boolean> {
  try {
    const child = Bun.spawn(["ffmpeg", "-version"], { stdout: "ignore", stderr: "ignore" });
    return (await child.exited) === 0;
  } catch {
    return false;
  }
}

export async function convertToMp3(inputPath: string): Promise<string> {
  const outputPath = tempPath(".mp3");
  try {
    await runFfmpeg(["-i", inputPath, "-vn", "-c:a", "libmp3lame", "-b:a", "128k", outputPath]);
    return outputPath;
  } catch (error) {
    await removeFile(outputPath);
    throw error;
  }
}

export function assertMaxSize(bytes: number, maxBytes: number, label: string): void {
  if (bytes > maxBytes) {
    throw new Error(`${label} is too large (${formatBytes(bytes)}, max ${formatBytes(maxBytes)}).`);
  }
}

export function assertAudioSize(bytes: number): void {
  assertMaxSize(bytes, config.limits.maxAudioBytes, "Audio");
}

export function assertVideoSize(bytes: number): void {
  assertMaxSize(bytes, config.limits.maxVideoBytes, "Video");
}

export async function detectMime(bytes: Uint8Array): Promise<{ mime: string; ext: string } | null> {
  const { fileTypeFromBuffer } = await import("file-type");
  const result = await fileTypeFromBuffer(bytes);
  return result ? { mime: result.mime, ext: result.ext } : null;
}

export async function fetchBytes(url: string, maxBytes: number): Promise<{ bytes: Uint8Array; contentType: string }> {
  const response = await fetch(url, {
    headers: { "User-Agent": BROWSER_USER_AGENT },
    redirect: "follow",
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`Download failed (HTTP ${response.status}).`);

  const declaredSize = Number(response.headers.get("content-length") || 0);
  assertMaxSize(declaredSize, maxBytes, "File");

  const bytes = new Uint8Array(await response.arrayBuffer());
  assertMaxSize(bytes.length, maxBytes, "File");
  return { bytes, contentType: (response.headers.get("content-type") || "").toLowerCase() };
}

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
