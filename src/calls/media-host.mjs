// Runs under Node, not Bun: carries the audio of WhatsApp calls (@roamhq/wrtc needs libuv functions Bun lacks).
// Talks to the bot with JSON lines on stdin/stdout.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { decodeCallMediaMessage, encodeCallMediaEvent, WaCallMediaReceiver } from "@zapo-js/voip-media";
import { nodeMediaHost, WaRawUdpLeg } from "@zapo-js/voip-media/node";

const RATE = 16_000;
const TICK_MS = 20;
const calls = new Map();

function out(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function log(level, text) {
  out({ type: "log", level, text });
}

// WhatsApp offers IPv6 relays too; on a network without IPv6 those fail at once while IPv4 carries the call.
function isUnreachableIpv6(text, detail) {
  const all = `${text} ${detail ? JSON.stringify(detail) : ""}`;
  return /EHOSTUNREACH|ENETUNREACH|raw_udp_connect_failed/.test(all) && /\[?[0-9a-f]{1,4}(:[0-9a-f]{0,4}){2,}/i.test(all);
}

const logger = {
  trace() {},
  debug() {},
  info: (text) => log("debug", String(text)),
  warn: (text, detail) => log(isUnreachableIpv6(text, detail) ? "debug" : "warn", `${text}${detail ? ` ${JSON.stringify(detail)}` : ""}`),
  error: (text, detail) => log("error", `${text}${detail ? ` ${JSON.stringify(detail)}` : ""}`),
  child: () => logger,
  level: "info",
};

function callFor(callId) {
  let call = calls.get(callId);
  if (call) return call;
  const receiver = new WaCallMediaReceiver({
    ...nodeMediaHost,
    // Group calls move between relays over plain UDP.
    createRawUdpLeg: (options) => new WaRawUdpLeg(options),
    logger,
    callId,
    send: (event) => out({ type: "event", text: encodeCallMediaEvent(event) }),
  });
  call = { receiver, queue: [], queued: 0, startedAt: performance.now(), sent: 0, playing: false };
  calls.set(callId, call);
  receiver.start().catch((error) => log("error", `codec failed to load: ${error}`));
  return call;
}

// Decodes any audio file to 16 kHz mono float samples with FFmpeg.
function decode(path) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", String(RATE), "pipe:1"]);
    const chunks = [];
    let stderr = "";
    ffmpeg.stdout.on("data", (chunk) => chunks.push(chunk));
    ffmpeg.stderr.on("data", (chunk) => (stderr += chunk));
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `ffmpeg exited with ${code}`));
      const bytes = Buffer.concat(chunks);
      resolve(new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 4)).slice());
    });
  });
}

async function play(callId, path) {
  const call = callFor(callId);
  try {
    const samples = await decode(path);
    call.queue.push(samples);
    call.queued += samples.length;
    call.playing = true;
    out({ type: "playing", callId, seconds: samples.length / RATE });
  } catch (error) {
    out({ type: "play_failed", callId, error: String(error.message ?? error) });
  }
}

function take(call, count) {
  const chunk = new Float32Array(count);
  let filled = 0;
  while (filled < count && call.queue.length) {
    const head = call.queue[0];
    const n = Math.min(count - filled, head.length);
    chunk.set(head.subarray(0, n), filled);
    filled += n;
    call.queued -= n;
    if (n === head.length) call.queue.shift();
    else call.queue[0] = head.subarray(n);
  }
  return { chunk, filled };
}

// The audio clock: capture is pushed and playout pulled on real time, silence when nothing is queued.
const playout = new Float32Array(RATE / 10);
setInterval(() => {
  const now = performance.now();
  for (const [callId, call] of calls) {
    const due = Math.floor(((now - call.startedAt) / 1000) * RATE) - call.sent;
    if (due <= 0) continue;
    const { chunk, filled } = take(call, due);
    call.sent += due;
    try {
      call.receiver.plane.pushCapture(chunk);
      // The peer's audio has to be drained on the same clock; nothing plays it yet.
      for (let left = due; left > 0; left -= playout.length) call.receiver.plane.pullPlayout(playout.subarray(0, Math.min(left, playout.length)));
    } catch (error) {
      log("warn", `audio tick failed: ${error}`);
    }
    if (call.playing && filled < due && call.queued === 0) {
      call.playing = false;
      out({ type: "played", callId });
    }
  }
}, TICK_MS);

function end(callId) {
  const call = calls.get(callId);
  if (!call) return;
  calls.delete(callId);
  try {
    call.receiver.stop();
  } catch {}
}

const lines = createInterface({ input: process.stdin });
lines.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.type === "media") {
    const decoded = decodeCallMediaMessage(message.text);
    callFor(decoded.callId).receiver.receive(decoded).catch((error) => log("warn", `media update failed: ${error}`));
  } else if (message.type === "play") {
    void play(message.callId, message.path);
  } else if (message.type === "stop_audio") {
    const call = calls.get(message.callId);
    if (call) {
      call.queue = [];
      call.queued = 0;
    }
  } else if (message.type === "end") {
    end(message.callId);
  }
});
lines.on("close", () => process.exit(0));
out({ type: "ready" });
