import path from "node:path";
import type { Subprocess } from "bun";
import type { WaClient, WaClientPluginDefinition } from "zapo-js";
import { errorMessage, logger } from "../lib/logger.ts";

// Calls are optional: they turn on when @zapo-js/voip is installed (bun add @zapo-js/voip @roamhq/wrtc libmlow-wasm-fork).
// Signaling runs here; the call audio runs in a Node helper (src/calls/media-host.mjs), because its WebRTC module crashes Bun.
const VOIP_PACKAGE = "@zapo-js/voip";
const MEDIA_PACKAGE = "@zapo-js/voip-media";
const HOST_SCRIPT = path.join(import.meta.dir, "../calls/media-host.mjs");

interface MediaCodec {
  encodeCallMediaMessage(message: unknown): string;
  decodeCallMediaEvent(text: string): unknown;
}

interface VoipClient {
  on(event: string, listener: (...args: never[]) => void): void;
  voip: { media: { handleEvent(message: unknown): void } };
}

type HostMessage =
  | { type: "ready" }
  | { type: "event"; text: string }
  | { type: "log"; level: "debug" | "warn" | "error"; text: string }
  | { type: "playing"; callId: string; seconds: number }
  | { type: "play_failed"; callId: string; error: string }
  | { type: "played"; callId: string };

let enabled = false;
let codec: MediaCodec | null = null;
let host: Subprocess<"pipe", "pipe", "inherit"> | null = null;
let client: VoipClient | null = null;
const waiting = new Map<string, { resolve: (seconds: number) => void; reject: (error: Error) => void }>();
const finished = new Map<string, () => void>();

export async function voipPlugins(): Promise<WaClientPluginDefinition[]> {
  if (process.env.DISABLE_CALLS === "true") return [];
  try {
    const { voipPlugin } = (await import(VOIP_PACKAGE)) as { voipPlugin: (options?: object) => WaClientPluginDefinition };
    codec = (await import(MEDIA_PACKAGE)) as MediaCodec;
    if (!Bun.which("node")) {
      logger.warn("Calls disabled: the call audio needs Node.js installed next to Bun.");
      return [];
    }
    if (!enabled) console.log("✓ Calls enabled (@zapo-js/voip)");
    enabled = true;
    return [voipPlugin({ media: { mode: "remote" } })];
  } catch (error) {
    if (!/Cannot find (package|module)/i.test(errorMessage(error))) logger.warn(`Calls disabled: ${errorMessage(error)}`);
    return [];
  }
}

function sendToHost(message: object): void {
  host?.stdin.write(`${JSON.stringify(message)}\n`);
}

function handleHostMessage(message: HostMessage): void {
  switch (message.type) {
    case "event":
      client?.voip.media.handleEvent(codec!.decodeCallMediaEvent(message.text));
      break;
    case "log":
      if (message.level === "debug") logger.debug(`[call audio] ${message.text}`);
      else logger[message.level](`[call audio] ${message.text}`);
      break;
    case "playing":
      waiting.get(message.callId)?.resolve(message.seconds);
      waiting.delete(message.callId);
      break;
    case "play_failed":
      waiting.get(message.callId)?.reject(new Error(message.error));
      waiting.delete(message.callId);
      break;
    case "played":
      finished.get(message.callId)?.();
      finished.delete(message.callId);
      break;
  }
}

async function readHost(proc: NonNullable<typeof host>): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of proc.stdout) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.trim()) handleHostMessage(JSON.parse(line) as HostMessage);
    }
  }
}

function startHost(): void {
  if (host) return;
  const proc = Bun.spawn(["node", HOST_SCRIPT], { stdin: "pipe", stdout: "pipe", stderr: "inherit" });
  host = proc;
  void readHost(proc).catch((error) => logger.warn(`Call audio helper output failed: ${errorMessage(error)}`));
  void proc.exited.then((code) => {
    if (host !== proc) return;
    host = null;
    logger.warn(`Call audio helper stopped (exit ${code}); restarting.`);
    setTimeout(startHost, 2_000);
  });
}

/** Connects a new client's calls to the audio helper. Does nothing when calls are off. */
export function wireCalls(wa: WaClient): void {
  if (!enabled) return;
  startHost();
  client = wa as unknown as VoipClient;
  client.on("voip_call_media", ({ message }: { message: unknown }) => {
    sendToHost({ type: "media", text: codec!.encodeCallMediaMessage(message) });
  });
  client.on("voip_call_ended", (call: { callId: string }) => sendToHost({ type: "end", callId: call.callId }));
}

/** Plays an audio file into a call (any format FFmpeg reads). Resolves with its length in seconds. */
export function playIntoCall(callId: string, file: string, onFinished?: () => void): Promise<number> {
  if (!enabled || !host) return Promise.reject(new Error("Calls are not enabled."));
  if (onFinished) finished.set(callId, onFinished);
  return new Promise((resolve, reject) => {
    waiting.set(callId, { resolve, reject });
    sendToHost({ type: "play", callId, path: path.resolve(file) });
  });
}

export function stopCallAudio(callId: string): void {
  sendToHost({ type: "stop_audio", callId });
}

export function callsEnabled(): boolean {
  return enabled;
}

export function stopCallHost(): void {
  const proc = host;
  host = null;
  proc?.kill();
}
