import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SQL, type Subprocess } from "bun";
import { buildStreamErrorDeviceRemoved, FakeWaServer, type FakePeer } from "@zapo-js/fake-server";

const ROOT = path.resolve(import.meta.dir, "..");
const SERVER_DIR = path.resolve(process.env.ASENA_SERVER_DIR ?? path.join(ROOT, "../asena-server"));
const HAS_SERVER = existsSync(path.join(SERVER_DIR, "go.mod"));
const OWNER = "5511999999999";
const BOT_DEVICE = "5511000000777:3@s.whatsapp.net";
const BOT_LID = "100000000000777:3@lid";
const PORT = 18000 + Math.floor(Math.random() * 1000);
const API = `http://127.0.0.1:${PORT}`;
const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/asena_test?sslmode=disable";
const REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15";
const APP_ORIGIN = "http://localhost:3999";
const BOT_PORT = PORT + 1000;

const originalDecode = TextDecoder.prototype.decode;
TextDecoder.prototype.decode = function (this: TextDecoder, input?: unknown, options?: { stream?: boolean }) {
  const isBytes = input instanceof ArrayBuffer || ArrayBuffer.isView(input);
  return isBytes ? originalDecode.call(this, input as Uint8Array, options) : String(input ?? "");
} as typeof originalDecode;

let wa: FakeWaServer;
let tmp: string;
let server: Subprocess;
let bot: Subprocess | null = null;
let hooks: string;
let sessionId = "";
let binary = "";

async function waitForOutput(proc: Subprocess, pattern: RegExp, timeoutMs = 30_000): Promise<string> {
  const reader = (proc.stdout as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + timeoutMs;
  try {
    while (Date.now() < deadline) {
      const chunk = await Promise.race([reader.read(), Bun.sleep(deadline - Date.now()).then(() => null)]);
      if (!chunk || chunk.done) break;
      text += decoder.decode(chunk.value);
      if (pattern.test(text)) return text;
    }
  } finally {
    reader.releaseLock();
  }
  throw new Error(`Timed out waiting for ${pattern}. Output so far:\n${text}`);
}

function startBot(dataDir: string, extraEnv: Record<string, string> = {}): Subprocess {
  return Bun.spawn(["bun", `--env-file=${path.join(tmp, "empty.env")}`, "src/index.ts"], {
    cwd: ROOT,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "inherit",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      SESSION_ID: sessionId,
      ASENA_SERVER: API,
      ASENA_TEST_HOOKS: hooks,
      DATA_DIR: dataDir,
      OWNER_NUMBER: OWNER,
      PREFIX: "#",
      BOT_MODE: "public",
      LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? "info",
      ZAPO_LOG_LEVEL: process.env.TEST_ZAPO_LOG_LEVEL ?? "error",
      SESSION_SYNC_SECONDS: "1",
      SESSION_HEARTBEAT_SECONDS: "1",
      ...extraEnv,
    },
  });
}

async function stopBot(signal: "SIGTERM" | "SIGKILL" = "SIGKILL"): Promise<void> {
  if (!bot) return;
  bot.kill(signal);
  await bot.exited;
  bot = null;
}

async function exitCodeWithin(proc: Subprocess, ms: number): Promise<number | null> {
  return Promise.race([proc.exited, Bun.sleep(ms).then(() => null)]);
}

async function connectBot(dataDir: string, extraEnv: Record<string, string> = {}) {
  const nextPipeline = wa.waitForNextAuthenticatedPipeline(30_000);
  const process = startBot(dataDir, extraEnv);
  const output = await waitForOutput(process, /Connected to WhatsApp/);
  const pipeline = await nextPipeline;
  const owner = await wa.createFakePeer({ jid: `${OWNER}@s.whatsapp.net`, displayName: "Owner" }, pipeline);
  return { process, owner, output, pipeline };
}

const ADMIN_TOKEN = "test-admin-token";

async function nextText(peer: FakePeer, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const received = await peer.expectMessage({ timeoutMs: deadline - Date.now() });
    const text = received.message.conversation ?? received.message.extendedTextMessage?.text ?? "";
    if (text) return text;
  }
  throw new Error("No text arrived.");
}

async function readEvents(url: string, onEvent: (event: Record<string, string>) => Promise<boolean>, init?: RequestInit): Promise<void> {
  const response = await fetch(url, init);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value);
    let split: number;
    while ((split = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const data = block.split("\n").find((line) => line.startsWith("data: "));
      if (data && (await onEvent(JSON.parse(data.slice(6))))) {
        await reader.cancel();
        return;
      }
    }
  }
}

async function pairThrough(start: () => Promise<Response>): Promise<string> {
  const response = await start();
  expect(response.status).toBe(201);
  const { id } = (await response.json()) as { id: string };

  let resolveQr: (qr: string) => void = () => {};
  const qr = new Promise<string>((resolve) => (resolveQr = resolve));
  const pairing = wa.waitForNextAuthenticatedPipeline(30_000).then((pipeline) =>
    wa.runPairing(pipeline, { deviceJid: BOT_DEVICE, deviceLid: BOT_LID }, async () => {
      const parts = (await qr).split(",");
      return { identityPublicKey: Buffer.from(parts[2]!, "base64"), advSecretKey: Buffer.from(parts[3]!, "base64") };
    }),
  );

  let result = "";
  await readEvents(`${API}/api/pair/${id}/events`, async (event) => {
    if (event.type === "qr") resolveQr(event.qr!);
    if (event.type === "error" || event.type === "timeout") throw new Error(event.message);
    if (event.type === "success") {
      result = event.sessionId!;
      expect(event.phone).toContain("•");
      return true;
    }
    return false;
  });
  await pairing;
  expect(result).toMatch(/^ASENA_[\w-]{43}$/);
  return result;
}

beforeAll(async () => {
  if (!HAS_SERVER) return;
  wa = await FakeWaServer.start();
  tmp = await mkdtemp(path.join(os.tmpdir(), "asena-pairing-e2e-"));
  await Bun.write(path.join(tmp, "empty.env"), "");
  hooks = JSON.stringify({
    chatSocketUrls: [wa.url],
    noiseRootCa: { publicKey: Buffer.from(wa.noiseRootCa.publicKey).toString("base64"), serial: wa.noiseRootCa.serial },
  });

  const db = new SQL(DATABASE_URL);
  await db.unsafe(`DROP TABLE IF EXISTS asena_cron_runs, asena_crons, asena_bot_events, asena_bot_commands,
    asena_bot_metrics, asena_sessions, asena_bots, asena_logins, asena_users CASCADE`);
  await db.close();
  await Bun.spawn(["redis-cli", "-u", REDIS_URL, "flushdb"], { stdout: "ignore" }).exited;

  binary = path.join(tmp, "asena-server");
  const build = Bun.spawn(["go", "build", "-o", binary, "."], { cwd: SERVER_DIR, stderr: "inherit" });
  expect(await build.exited).toBe(0);

  const hasher = Bun.spawn([binary, "hash-password"], { stdin: new Blob(["correct horse battery\n"]), stdout: "pipe", stderr: "ignore" });
  const passwordHash = (await new Response(hasher.stdout).text()).trim();
  expect(passwordHash).toStartWith("pbkdf2-sha256$");

  server = Bun.spawn([binary], {
    cwd: SERVER_DIR,
    stdout: "ignore",
    stderr: Bun.file(path.join(tmp, "server.log")),
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      PORT: String(PORT),
      DATABASE_URL,
      REDIS_URL,
      PHONE_PEPPER: "test-pepper",
      ADMIN_TOKEN: "test-admin-token",
      ADMIN_USERNAME: "admin",
      ADMIN_PASSWORD_HASH: passwordHash,
      APP_URL: `${APP_ORIGIN}/dashboard`,
      ADMIN_URL: `${APP_ORIGIN}/admin`,
      PUBLIC_URL: API,
      DEV_LOGIN: "true",
      CRON_ALLOW_PRIVATE: "true",
      WORKER_SCRIPT: path.join(SERVER_DIR, "worker/worker.ts"),
      ASENA_TEST_HOOKS: hooks,
    },
  });
  for (let i = 0; i < 50; i++) {
    if (await fetch(`${API}/api/health`).then((r) => r.ok).catch(() => false)) return;
    await Bun.sleep(200);
  }
  throw new Error("Go server did not start.");
}, 120_000);

afterAll(async () => {
  if (!HAS_SERVER) return;
  if (process.env.KEEP_LOGS) console.log(await Bun.file(path.join(tmp, "server.log")).text());
  await stopBot();
  server?.kill("SIGTERM");
  await server?.exited;
  await wa?.stop().catch(() => {});
  await rm(tmp, { recursive: true, force: true });
});

describe.skipIf(!HAS_SERVER)("pairing server", () => {
  test("rejects bad pairing requests", async () => {
    const bad = await fetch(`${API}/api/pair`, { method: "POST", body: JSON.stringify({ method: "code", phone: "12" }) });
    expect(bad.status).toBe(400);
    const claim = await fetch(`${API}/api/session/claim`, { method: "POST", headers: { Authorization: "Bearer nope" } });
    expect(claim.status).toBe(401);
  });

  test("QR pairing hands out a session ID", async () => {
    sessionId = await pairThrough(() => fetch(`${API}/api/pair`, { method: "POST", body: JSON.stringify({ method: "qr" }) }));
  }, 60_000);

  test("the bot loads the session from the server, logs in and answers", async () => {
    const connected = await connectBot(path.join(tmp, "machine-a"));
    bot = connected.process;
    expect(connected.output).toContain("Session loaded from the Asena server");

    await connected.owner.sendConversation("#ping");
    expect(await nextText(connected.owner)).toMatch(/Pong/);

    await connected.owner.sendConversation("#note set wifi blue-house-24");
    expect(await nextText(connected.owner)).toContain("wifi");
  }, 60_000);

  test("state survives a restart on a machine with an empty disk", async () => {
    await Bun.sleep(1_500);
    await stopBot("SIGTERM");

    const connected = await connectBot(path.join(tmp, "machine-b"));
    bot = connected.process;
    await connected.owner.sendConversation("#note get wifi");
    expect(await nextText(connected.owner)).toContain("blue-house-24");
  }, 60_000);

  test("the admin API shows the running session", async () => {
    const unauthorized = await fetch(`${API}/api/admin/sessions`);
    expect(unauthorized.status).toBe(401);

    const response = await fetch(`${API}/api/admin/sessions`, { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });
    const body = (await response.json()) as { total: number; sessions: Record<string, unknown>[] };
    expect(body.total).toBe(1);
    expect(body.sessions[0]!.running).toBe(true);
    expect(body.sessions[0]!.uploads as number).toBeGreaterThan(0);
    expect(body.sessions[0]!.phone).toContain("•");

    const stats = (await (await fetch(`${API}/api/stats`)).json()) as Record<string, number>;
    expect(stats.totalSessions).toBe(1);
    expect(stats.activeNow).toBe(1);
  });

  test("a second copy takes over and the first one stops", async () => {
    const first = bot!;
    const connected = await connectBot(path.join(tmp, "machine-c"));
    bot = connected.process;
    expect(await exitCodeWithin(first, 15_000)).toBe(1);

    const admin = await fetch(`${API}/api/admin/sessions`, { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });
    const body = (await admin.json()) as { sessions: Record<string, unknown>[] };
    expect(body.sessions[0]!.running).toBe(true);
  }, 60_000);

  test("revoking the session stops the bot", async () => {
    const revoke = await fetch(`${API}/api/session/revoke`, { method: "POST", headers: { Authorization: `Bearer ${sessionId}` } });
    expect(revoke.status).toBe(204);
    expect(await exitCodeWithin(bot!, 15_000)).toBe(1);
    bot = null;

    const claim = await fetch(`${API}/api/session/claim`, { method: "POST", headers: { Authorization: `Bearer ${sessionId}` } });
    expect(claim.status).toBe(410);
  }, 30_000);
});

describe.skipIf(!HAS_SERVER)("dashboard", () => {
  let cookie = "";
  let botId = "";
  const app = (pathname: string, init: RequestInit = {}) =>
    fetch(`${API}${pathname}`, {
      ...init,
      headers: { Cookie: cookie, Origin: APP_ORIGIN, "Content-Type": "application/json", ...init.headers },
    });

  test("signing in sets a login cookie", async () => {
    expect((await fetch(`${API}/api/app/me`)).status).toBe(401);
    const login = await fetch(`${API}/api/auth/dev/start?next=/bots`, { redirect: "manual" });
    expect(login.status).toBe(302);
    expect(login.headers.get("location")).toBe(`${APP_ORIGIN}/dashboard/bots`);
    cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    dashboardCookie = cookie;
    const me = (await (await app("/api/app/me")).json()) as { name: string };
    expect(me.name).toBe("Developer");

    const evil = await fetch(`${API}/api/app/bots`, { method: "POST", headers: { Cookie: cookie, Origin: "https://evil.example" }, body: "{}" });
    expect(evil.status).toBe(403);
  });

  test("a named bot gets its session from a dashboard pairing", async () => {
    const created = await app("/api/app/bots", { method: "POST", body: JSON.stringify({ name: "  Runners   Club " }) });
    expect(created.status).toBe(201);
    botId = ((await created.json()) as { id: string }).id;

    sessionId = await pairThrough(() => app(`/api/app/bots/${botId}/pair`, { method: "POST", body: JSON.stringify({ method: "qr" }) }));
    const { bots } = (await (await app("/api/app/bots")).json()) as { bots: { name: string; status: string }[] };
    expect(bots).toHaveLength(1);
    expect(bots[0]!.name).toBe("Runners Club");
    expect(bots[0]!.status).toBe("waiting");
  }, 60_000);

  test("the running bot reports live metrics, events and its keep-alive URL", async () => {
    const connected = await connectBot(path.join(tmp, "machine-d"), { PORT: String(BOT_PORT), PUBLIC_URL: `http://127.0.0.1:${BOT_PORT}` });
    bot = connected.process;

    const live: Record<string, unknown>[] = [];
    const watching = readEvents(
      `${API}/api/app/bots/${botId}/live`,
      async (event) => {
        live.push(event);
        return event.type === "beat" && (event.counts as unknown as { commands: number }).commands > 0;
      },
      { headers: { Cookie: cookie, Origin: APP_ORIGIN } },
    );
    await connected.owner.sendConversation("#ping");
    expect(await nextText(connected.owner)).toMatch(/Pong/);
    await Promise.race([watching, Bun.sleep(10_000).then(() => Promise.reject(new Error("no live beat")))]);
    expect(live[0]!.type).toBe("status");

    const health = (await (await fetch(`http://127.0.0.1:${BOT_PORT}/health`)).json()) as { connected: boolean };
    expect(health.connected).toBe(true);

    const detail = (await (await app(`/api/app/bots/${botId}`)).json()) as {
      bot: { status: string; externalUrl: string; session: { version: string } };
      events: { kind: string }[];
    };
    expect(detail.bot.status).toBe("online");
    expect(detail.bot.externalUrl).toBe(`http://127.0.0.1:${BOT_PORT}`);
    expect(detail.events.map((event) => event.kind)).toContain("connected");

    const metrics = (await (await app(`/api/app/bots/${botId}/metrics?range=1h`)).json()) as {
      points: { messagesIn: number; messagesOut: number }[];
      topCommands: { command: string; count: number }[];
    };
    expect(metrics.points).toHaveLength(60);
    expect(metrics.points.reduce((sum, point) => sum + point.messagesIn, 0)).toBeGreaterThan(0);
    expect(metrics.points.reduce((sum, point) => sum + point.messagesOut, 0)).toBeGreaterThan(0);
    expect(metrics.topCommands[0]).toEqual({ command: "ping", count: 1 });
  }, 60_000);

  test("a cron job pings the bot's keep-alive URL", async () => {
    const bad = await app(`/api/app/bots/${botId}/crons`, { method: "POST", body: JSON.stringify({ url: "ftp://x", intervalMinutes: 10 }) });
    expect(bad.status).toBe(400);
    const created = await app(`/api/app/bots/${botId}/crons`, {
      method: "POST",
      body: JSON.stringify({ url: `http://127.0.0.1:${BOT_PORT}/health`, intervalMinutes: 10 }),
    });
    expect(created.status).toBe(201);

    for (let i = 0; i < 60; i++) {
      const { crons } = (await (await app(`/api/app/bots/${botId}`)).json()) as { crons: { lastStatus: number | null; runs: unknown[] }[] };
      if (crons[0]?.lastStatus) {
        expect(crons[0].lastStatus).toBe(200);
        expect(crons[0].runs).toHaveLength(1);
        return;
      }
      await Bun.sleep(500);
    }
    throw new Error("The cron job never ran.");
  }, 40_000);

  test("a logout from the phone stops the bot and marks the session", async () => {
    const pipeline = (await wa.waitForAuthenticatedPipeline()) as { sendStanza(node: unknown): Promise<void> };
    await pipeline.sendStanza(buildStreamErrorDeviceRemoved());
    expect(await exitCodeWithin(bot!, 15_000)).toBe(1);
    bot = null;

    const { bot: detail } = (await (await app(`/api/app/bots/${botId}`)).json()) as { bot: { status: string } };
    expect(detail.status).toBe("logged_out");
    const claim = await fetch(`${API}/api/session/claim`, { method: "POST", headers: { Authorization: `Bearer ${sessionId}` } });
    expect(claim.status).toBe(410);
    expect(((await claim.json()) as { reason: string }).reason).toBe("logged_out");
  }, 30_000);

  test("refreshing keeps the bot and its history, with a new session ID", async () => {
    const oldId = sessionId;
    sessionId = await pairThrough(() => app(`/api/app/bots/${botId}/pair`, { method: "POST", body: JSON.stringify({ method: "qr" }) }));
    expect(sessionId).not.toBe(oldId);

    const detail = (await (await app(`/api/app/bots/${botId}`)).json()) as { bot: { status: string }; events: { kind: string }[]; crons: unknown[] };
    expect(detail.bot.status).toBe("waiting");
    expect(detail.crons).toHaveLength(1);
    expect(detail.events.filter((event) => event.kind === "session")).toHaveLength(2);
    const metrics = (await (await app(`/api/app/bots/${botId}/metrics?range=1h`)).json()) as { topCommands: unknown[] };
    expect(metrics.topCommands).toHaveLength(1);
  }, 60_000);

  test("a session from the public pair page can be imported", async () => {
    const publicId = await pairThrough(() => fetch(`${API}/api/pair`, { method: "POST", body: JSON.stringify({ method: "qr" }) }));
    const imported = await app("/api/app/bots", { method: "POST", body: JSON.stringify({ name: "Imported", sessionId: publicId }) });
    expect(imported.status).toBe(201);
    const again = await app("/api/app/bots", { method: "POST", body: JSON.stringify({ name: "Twice", sessionId: publicId }) });
    expect(again.status).toBe(409);
    const { bots } = (await (await app("/api/app/bots")).json()) as { bots: { name: string }[] };
    expect(bots.map((b) => b.name)).toEqual(["Runners Club", "Imported"]);
  }, 60_000);
});

let dashboardCookie = "";

describe.skipIf(!HAS_SERVER)("admin console", () => {
  const ADMIN_ORIGIN = APP_ORIGIN;

  test("needs the right password and sees every bot", async () => {
    const login = (password: string) =>
      fetch(`${API}/api/admin/login`, {
        method: "POST",
        headers: { Origin: ADMIN_ORIGIN, "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password }),
      });
    expect((await login("wrong password")).status).toBe(401);
    const ok = await login("correct horse battery");
    expect(ok.status).toBe(200);
    const cookie = ok.headers.get("set-cookie")!.split(";")[0]!;
    const admin = (pathname: string) => fetch(`${API}${pathname}`, { headers: { Cookie: cookie, Origin: ADMIN_ORIGIN } });

    expect((await fetch(`${API}/api/admin/overview`)).status).toBe(401);
    const overview = (await (await admin("/api/admin/overview")).json()) as { users: number; bots: number; last24h: { commands: number } };
    expect(overview.users).toBe(1);
    expect(overview.bots).toBe(2);
    expect(overview.last24h.commands).toBeGreaterThan(0);

    const { users } = (await (await admin("/api/admin/users")).json()) as { users: { bots: number }[] };
    expect(users[0]!.bots).toBe(2);
    const { bots } = (await (await admin("/api/admin/bots")).json()) as { bots: { ownerName: string }[] };
    expect(bots).toHaveLength(2);
    expect(bots[0]!.ownerName).toBe("Developer");
  });
});

describe.skipIf(!HAS_SERVER)("account deletion", () => {
  test("deletes the account, its bots and revokes their sessions", async () => {
    const headers = { Cookie: dashboardCookie, Origin: APP_ORIGIN };
    const deleted = await fetch(`${API}/api/app/me`, { method: "DELETE", headers });
    expect(deleted.status).toBe(204);
    expect((await fetch(`${API}/api/app/me`, { headers })).status).toBe(401);
    const claim = await fetch(`${API}/api/session/claim`, { method: "POST", headers: { Authorization: `Bearer ${sessionId}` } });
    expect(claim.status).toBe(410);
  });
});
