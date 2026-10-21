import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { config } from "../config.ts";
import { dashboardCounters } from "../features/metrics.ts";
import { errorMessage, logger } from "../lib/logger.ts";
import { tempPath } from "../lib/media.ts";
import { botStatus, hostingPlatform } from "./status.ts";

const BUNDLE_FORMAT = "asena-bundle-v1";
const MAGIC = new TextEncoder().encode("ASB1");
const LEASE_LOST = new Set([404, 409, 410]);

let leaseId = "";
let lastUploadedHash = "";
let syncTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let syncing: Promise<void> | null = null;
let onLeaseLost: (reason: string) => void = () => {};
let reported = { messagesIn: 0, messagesOut: 0, commands: 0, errors: 0, byCommand: {} as Record<string, number> };

const files = () => [
  { name: "session.db", path: config.database.sessionFile },
  { name: "bot.db", path: config.database.botFile },
];

function request(pathname: string, init: RequestInit = {}): Promise<Response> {
  return fetch(new URL(pathname, config.sessionServer), {
    ...init,
    headers: { Authorization: `Bearer ${config.sessionId}`, "X-Lease-Id": leaseId, ...init.headers },
    signal: AbortSignal.timeout(60_000),
  });
}

async function errorText(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? `HTTP ${response.status}`;
}

async function cipherKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const material = await crypto.subtle.importKey("raw", encoder.encode(config.sessionId), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: encoder.encode("asena-session-v1"), info: encoder.encode("snapshot") },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function pack(entries: { name: string; data: Uint8Array }[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [MAGIC, Uint8Array.of(entries.length)];
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const size = new Uint8Array(4);
    new DataView(size.buffer).setUint32(0, entry.data.length);
    parts.push(Uint8Array.of(name.length), name, size, entry.data);
  }
  return new Uint8Array(Buffer.concat(parts));
}

function unpack(bundle: Uint8Array): Map<string, Uint8Array> {
  if (!MAGIC.every((byte, i) => bundle[i] === byte)) throw new Error("Unknown snapshot bundle.");
  const view = new DataView(bundle.buffer, bundle.byteOffset, bundle.byteLength);
  const result = new Map<string, Uint8Array>();
  let offset = 5;
  for (let i = 0; i < bundle[4]!; i++) {
    const nameLength = bundle[offset]!;
    const name = new TextDecoder().decode(bundle.subarray(offset + 1, offset + 1 + nameLength));
    offset += 1 + nameLength;
    const size = view.getUint32(offset);
    result.set(name, bundle.slice(offset + 4, offset + 4 + size));
    offset += 4 + size;
  }
  return result;
}

async function removeDatabase(file: string): Promise<void> {
  await Promise.all([file, `${file}-wal`, `${file}-shm`].map((f) => rm(f, { force: true })));
}

async function exportDatabase(file: string): Promise<Uint8Array | null> {
  if (!existsSync(file)) return null;
  const copy = tempPath(".db");
  try {
    const db = new Database(file);
    db.run("VACUUM INTO ?", [copy]);
    db.close();
    return await Bun.file(copy).bytes();
  } finally {
    await rm(copy, { force: true });
  }
}

export async function prepareRemoteSession(): Promise<void> {
  const claim = (force: boolean) =>
    request("/api/session/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force }) });

  let response = await claim(false);
  if (response.status === 409) {
    logger.warn("This session is running on another machine. Taking over; the other copy will stop.");
    response = await claim(true);
  }
  if (!response.ok) throw new Error(`Could not load the session: ${await errorText(response)}`);
  const body = (await response.json()) as { format: string; snapshot: string; nonce: string; leaseId: string };
  leaseId = body.leaseId;

  let plain: Uint8Array;
  try {
    plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(Buffer.from(body.nonce, "base64")) },
        await cipherKey(),
        new Uint8Array(Buffer.from(body.snapshot, "base64")),
      ),
    );
  } catch {
    throw new Error("SESSION_ID does not match the stored session. Check that you copied it completely.");
  }

  await mkdir(config.database.dataDir, { recursive: true });
  for (const file of files()) await removeDatabase(file.path);

  if (body.format === BUNDLE_FORMAT) {
    const entries = unpack(plain);
    for (const file of files()) {
      const data = entries.get(file.name);
      if (data) await Bun.write(file.path, data);
    }
  } else {
    await Bun.write(config.database.sessionFile, plain);
  }
  lastUploadedHash = "";
}

async function upload(): Promise<void> {
  const entries: { name: string; data: Uint8Array }[] = [];
  for (const file of files()) {
    const data = await exportDatabase(file.path);
    if (data) entries.push({ name: file.name, data });
  }
  const bundle = pack(entries);
  const hash = new Bun.CryptoHasher("sha256").update(bundle).digest("hex");
  if (hash === lastUploadedHash) return;

  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, await cipherKey(), bundle));
  const response = await request(`/api/session/snapshot?format=${BUNDLE_FORMAT}`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: Buffer.concat([nonce, ciphertext]),
  });
  if (LEASE_LOST.has(response.status)) {
    onLeaseLost(await errorText(response));
    return;
  }
  if (!response.ok) throw new Error(`Snapshot upload failed (${await errorText(response)}).`);
  lastUploadedHash = hash;
}

export function syncNow(): Promise<void> {
  syncing ??= upload()
    .catch((error) => logger.warn(`Session sync failed: ${errorMessage(error)}`))
    .finally(() => {
      syncing = null;
    });
  return syncing;
}

function countsSinceLastBeat(now: typeof reported) {
  const byCommand: Record<string, number> = {};
  for (const [name, total] of Object.entries(now.byCommand)) {
    const delta = total - (reported.byCommand[name] ?? 0);
    if (delta > 0) byCommand[name] = delta;
  }
  return {
    messagesIn: now.messagesIn - reported.messagesIn,
    messagesOut: now.messagesOut - reported.messagesOut,
    commands: now.commands - reported.commands,
    errors: now.errors - reported.errors,
    byCommand,
  };
}

async function heartbeat(): Promise<void> {
  const now = dashboardCounters();
  try {
    const response = await request("/api/session/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        version: config.version,
        platform: hostingPlatform(),
        externalUrl: config.publicUrl,
        memoryMb: Math.round(process.memoryUsage.rss() / 1024 / 1024),
        uptimeSeconds: Math.floor((Date.now() - botStatus.startedAt) / 1000),
        connected: botStatus.connected,
        counts: countsSinceLastBeat(now),
      }),
    });
    if (response.ok) reported = now;
    if (LEASE_LOST.has(response.status)) onLeaseLost(await errorText(response));
  } catch (error) {
    logger.debug(`Heartbeat failed: ${errorMessage(error)}`);
  }
}

function stopTimers(): void {
  if (syncTimer) clearInterval(syncTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  syncTimer = heartbeatTimer = null;
}

export function startRemoteSync(handleLeaseLost: (reason: string) => void): void {
  onLeaseLost = (reason) => {
    stopTimers();
    leaseId = "";
    handleLeaseLost(reason);
  };
  stopTimers();
  syncTimer = setInterval(() => void syncNow(), config.sessionSyncMs);
  heartbeatTimer = setInterval(() => void heartbeat(), config.sessionHeartbeatMs);
  void heartbeat();
}

export type SessionEvent = "connected" | "disconnected" | "logged_out" | "replaced" | "started" | "stopped";

export async function reportSessionEvent(kind: SessionEvent, detail = ""): Promise<void> {
  if (!config.sessionId || !leaseId) return;
  await request("/api/session/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind, detail }),
  }).catch((error) => logger.debug(`Session event failed: ${errorMessage(error)}`));
}

/** A one-hour token for the AI server, so bots with a session ID need no AI key of their own. */
export async function requestAiToken(): Promise<{ token: string; expiresAt: number }> {
  if (!config.sessionId || !leaseId) throw new Error("No active session.");
  const response = await request("/api/session/ai-token", { method: "POST" });
  if (!response.ok) throw new Error(`AI token: ${await errorText(response)}`);
  return (await response.json()) as { token: string; expiresAt: number };
}

export async function finishRemoteSession(): Promise<void> {
  if (!config.sessionId || !leaseId) return;
  stopTimers();
  await syncing;
  await syncNow();
  await heartbeat();
  await reportSessionEvent("stopped");
  await request("/api/session/release", { method: "POST" }).catch(() => {});
  leaseId = "";
}
