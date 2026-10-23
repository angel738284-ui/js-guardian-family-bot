import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FakeWaServer, type FakePeer } from "@zapo-js/fake-server";
import https from "node:https";
import sharp from "sharp";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const OWNER = "5511999999999";
const STRANGER = "5511888888888";
const BOT_DEVICE = "5511000000000:2@s.whatsapp.net";
const BOT_LID = "100000000000001:2@lid";

let server: FakeWaServer;
let dataDir: string;
let owner: FakePeer;
let stranger: FakePeer;
let stopBot: () => Promise<void>;

function textOf(message: { conversation?: string | null; extendedTextMessage?: { text?: string | null } | null }): string {
  return message.conversation ?? message.extendedTextMessage?.text ?? "";
}

async function nextText(peer: FakePeer, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const received = await peer.expectMessage({ timeoutMs: deadline - Date.now() });
    const text = textOf(received.message);
    if (text) return text;
  }
  throw new Error("No text message arrived in time.");
}

async function nextWith(peer: FakePeer, field: string, timeoutMs = 30_000): Promise<Record<string, any>> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const received = await peer.expectMessage({ timeoutMs: deadline - Date.now() });
    const value = (received.message as Record<string, unknown>)[field];
    if (value) return value as Record<string, any>;
    const text = textOf(received.message);
    if (text.startsWith("❌") || text.startsWith("⚠️")) throw new Error(`Bot replied with an error: ${text}`);
  }
  throw new Error(`No ${field} arrived in time.`);
}

async function expectSilence(peer: FakePeer, ms = 2_500): Promise<void> {
  const result = await peer.expectMessage({ timeoutMs: ms }).then(
    (message) => message,
    () => null,
  );
  expect(result).toBeNull();
}

const originalDecode = TextDecoder.prototype.decode;
TextDecoder.prototype.decode = function (this: TextDecoder, input?: unknown, options?: { stream?: boolean }) {
  const isBytes = input instanceof ArrayBuffer || ArrayBuffer.isView(input);
  return isBytes ? originalDecode.call(this, input as Uint8Array, options) : String(input ?? "");
} as typeof originalDecode;

function redirectCdnToFakeServer(): void {
  const originalRequest = https.request;
  const fakeMedia = new URL(server.mediaUrl("/"));
  (https as { request: typeof https.request }).request = ((url: string | URL, ...rest: unknown[]) => {
    const target = new URL(String(url));
    if (/^mmg(-fallback)?\.whatsapp\.net$/.test(target.hostname)) {
      target.host = fakeMedia.host;
    }
    return (originalRequest as (...args: unknown[]) => ReturnType<typeof https.request>)(target, ...rest);
  }) as typeof https.request;
}

beforeAll(async () => {
  server = await FakeWaServer.start();
  redirectCdnToFakeServer();
  dataDir = await mkdtemp(path.join(os.tmpdir(), "asena-e2e-"));

  process.env.DATA_DIR = dataDir;
  process.env.PREFIX = "#";
  process.env.BOT_MODE = "public";
  process.env.BOT_LANG = "en";
  process.env.SUDO = "";
  process.env.OWNER_NUMBER = OWNER;
  process.env.DATABASE_URL = "";
  process.env.PAIRING_NUMBER = "";
  process.env.ENABLE_EVAL = "true";
  process.env.AI_URL = "";
  process.env.AI_KEY = "";
  process.env.SESSION_ID = "";
  process.env.LOG_LEVEL = process.env.TEST_LOG_LEVEL ?? "error";
  process.env.ZAPO_LOG_LEVEL = process.env.TEST_ZAPO_LOG_LEVEL ?? "error";

  const { prepareBot } = await import("../src/app.ts");
  const connection = await import("../src/bot/connection.ts");
  const { requireClient } = await import("../src/bot/client.ts");
  stopBot = connection.stopBot;

  await prepareBot();
  await connection.startBot({
    chatSocketUrls: [server.url],
    testHooks: { noiseRootCa: server.noiseRootCa },
    proxy: { mediaUpload: server.mediaProxyAgent, mediaDownload: server.mediaProxyAgent },
  });

  const qr = new Promise<string>((resolve) => requireClient().once("auth_qr", ({ qr }) => resolve(qr)));
  const firstPipeline = await server.waitForAuthenticatedPipeline();
  await server.runPairing(firstPipeline, { deviceJid: BOT_DEVICE, deviceLid: BOT_LID }, async () => {
    const parts = (await qr).split(",");
    return {
      identityPublicKey: Buffer.from(parts[2]!, "base64"),
      advSecretKey: Buffer.from(parts[3]!, "base64"),
    };
  });

  const pipeline = await server.waitForNextAuthenticatedPipeline();
  owner = await server.createFakePeer({ jid: `${OWNER}@s.whatsapp.net`, displayName: "Owner" }, pipeline);
  stranger = await server.createFakePeer({ jid: `${STRANGER}@s.whatsapp.net`, displayName: "Stranger" }, pipeline);
}, 60_000);

afterAll(async () => {
  await stopBot?.();
  await server?.stop();
  await rm(dataDir, { recursive: true, force: true });
});

describe("private chat commands", () => {
  test("#ping answers with pong and a time", async () => {
    await owner.sendConversation("#ping");
    expect(await nextText(owner)).toBe("Pong");
    const edit = await nextWith(owner, "protocolMessage");
    expect(edit.editedMessage?.conversation ?? edit.editedMessage?.extendedTextMessage?.text).toMatch(/^Pong · \d+ ms$/);
  });

  test("the command name is not case sensitive and allows a space after the prefix", async () => {
    await owner.sendConversation("# PING");
    expect(await nextText(owner)).toBe("Pong");
    await nextWith(owner, "protocolMessage");
  });

  test("normal messages get no reply", async () => {
    await owner.sendConversation("hello there");
    await expectSilence(owner);
  });

  test("#menu lists commands by section; owner section only for the owner", async () => {
    await owner.sendConversation("#menu");
    const menu = await nextText(owner);
    expect(menu).toContain("*System*");
    expect(menu).toContain("  • ping");
    expect(menu).not.toContain("#ping");
    expect(menu).toContain("*Owner*");
    expect(menu).not.toContain("cmdlist");

    await stranger.sendConversation("#menu");
    const strangerMenu = await nextText(stranger);
    expect(strangerMenu).toContain("  • ping");
    expect(strangerMenu).not.toContain("*Owner*");
  });

  test("#help shows details and aliases", async () => {
    await owner.sendConversation("#help sticker");
    const help = await nextText(owner);
    expect(help).toContain("*#sticker*");
    expect(help).toContain("#s");
  });

  test("notes are saved per user", async () => {
    await owner.sendConversation("#note set shop milk and eggs");
    expect(await nextText(owner)).toContain("shop");

    await owner.sendConversation("#note get shop");
    expect(await nextText(owner)).toContain("milk and eggs");

    await stranger.sendConversation("#note get shop");
    expect(await nextText(stranger)).toContain("not found");
  });

  test("#remind validates the time", async () => {
    await owner.sendConversation("#remind soon do stuff");
    expect(await nextText(owner)).toContain("Usage");

    await owner.sendConversation("#remind 10m check the oven");
    expect(await nextText(owner)).toContain("Reminder set");
  });

  test("#remind call sets a reminder that will also ring", async () => {
    await owner.sendConversation("#remind 2h call take the meds");
    const set = await nextText(owner);
    expect(set).toContain("Reminder set");
    expect(set).toContain("I will also call you");

    await owner.sendConversation("#reminders");
    const list = await nextText(owner);
    expect(list).toContain("(call) — take the meds");

    const id = /`(r\w+)`[^\n]*\(call\)/.exec(list)![1];
    await owner.sendConversation(`#cancelremind ${id}`);
    expect(await nextText(owner)).toContain("Cancelled");
  });
});

describe("eval", () => {
  test("#eval runs code for the owner", async () => {
    await owner.sendConversation("#eval 6 * 7");
    expect(await nextText(owner)).toContain("42");

    await owner.sendConversation("#eval\nconst list: number[] = [1, 2, 3];\nreturn list.map((n) => n * 2);");
    expect(await nextText(owner)).toContain("[ 2, 4, 6 ]");

    await owner.sendConversation("#eval chat");
    expect(await nextText(owner)).toContain(`${OWNER}@s.whatsapp.net`);
  });

  test("#eval reports errors instead of crashing", async () => {
    await owner.sendConversation("#eval throw new Error('boom')");
    expect(await nextText(owner)).toContain("Error: boom");
  });

  test("#eval is refused for everyone else", async () => {
    await stranger.sendConversation("#eval 1 + 1");
    expect(await nextText(stranger)).toContain("only for the bot owner");
  });
});

describe("status, number request, invite", () => {
  test("#story posts a text status and can undo it", async () => {
    await owner.sendConversation("#story --color teal --font bold Hello from the test");
    expect(await nextText(owner)).toContain("Status posted");

    await owner.sendConversation("#story undo");
    expect(await nextText(owner)).toContain("deleted");
  }, 30_000);

  test("#story rejects bad options and shows help without text", async () => {
    await owner.sendConversation("#story --color notacolor hi");
    expect(await nextText(owner)).toContain("Unknown color");

    await owner.sendConversation("#story");
    expect(await nextText(owner)).toContain("Post a status");
  });

  test("#reqnum sends a phone number request", async () => {
    await owner.sendConversation("#reqnum");
    const request = await nextWith(owner, "requestPhoneNumberMessage");
    expect(request).toBeDefined();
  });

  test("#story and #reqnum are owner/sudo only", async () => {
    await stranger.sendConversation("#story hi");
    expect(await nextText(stranger)).toContain("only for the bot owner");
  });
});

describe("permissions", () => {
  test("strangers cannot change the mode", async () => {
    await stranger.sendConversation("#mode private");
    expect(await nextText(stranger)).toContain("only for the bot owner");
  });

  test("strangers cannot change the language", async () => {
    await stranger.sendConversation("#lang hi");
    expect(await nextText(stranger)).toContain("only for the bot owner");
  });

  test("private mode ignores strangers silently, owner still works", async () => {
    await owner.sendConversation("#mode private");
    expect(await nextText(owner)).toContain("private");

    await stranger.sendConversation("#ping");
    await expectSilence(stranger);

    await owner.sendConversation("#mode public");
    expect(await nextText(owner)).toContain("public");

    await stranger.sendConversation("#ping");
    expect(await nextText(stranger)).toBe("Pong");
    await nextWith(stranger, "protocolMessage");
  });

  test("group-only commands refuse private chats", async () => {
    await owner.sendConversation("#kick");
    expect(await nextText(owner)).toContain("only works in groups");
  });
});

describe("media commands", () => {
  async function publish(bytes: Uint8Array, mediaType: "image" | "video" | "sticker") {
    const blob = await server.publishMediaBlob({ plaintext: bytes, mediaType });
    return {
      url: server.mediaUrl(blob.path),
      directPath: blob.path,
      mediaKey: blob.mediaKey,
      fileSha256: blob.fileSha256,
      fileEncSha256: blob.fileEncSha256,
      fileLength: blob.fileLength,
    };
  }

  test("#sticker turns a photo into a WebP sticker", async () => {
    const png = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#ff0000" } }).png().toBuffer();
    const image = await publish(new Uint8Array(png), "image");
    await owner.sendMessage({ imageMessage: { ...image, mimetype: "image/png", caption: "#sticker" } });

    const sticker = await nextWith(owner, "stickerMessage");
    expect(sticker.mimetype).toBe("image/webp");
  }, 40_000);

  test("#toimg works as a reply to a sticker", async () => {
    const webp = await sharp({ create: { width: 512, height: 512, channels: 4, background: "#00ff0080" } }).webp().toBuffer();
    const sticker = await publish(new Uint8Array(webp), "sticker");
    await owner.sendMessage({
      extendedTextMessage: {
        text: "#toimg",
        contextInfo: {
          stanzaId: "QUOTED1",
          participant: `${OWNER}@s.whatsapp.net`,
          quotedMessage: { stickerMessage: { ...sticker, mimetype: "image/webp" } },
        },
      },
    });

    const image = await nextWith(owner, "imageMessage");
    expect(image.mimetype).toBe("image/png");
  }, 40_000);

  test("#tomp3 converts a video to MP3 with FFmpeg", async () => {
    const videoPath = path.join(dataDir, "clip.mp4");
    const ffmpeg = Bun.spawn(
      ["ffmpeg", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10", "-f", "lavfi", "-i", "sine=frequency=440",
        "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", videoPath],
      { stdout: "ignore", stderr: "inherit" },
    );
    expect(await ffmpeg.exited).toBe(0);

    const video = await publish(new Uint8Array(await Bun.file(videoPath).arrayBuffer()), "video");
    await owner.sendMessage({ videoMessage: { ...video, mimetype: "video/mp4", caption: "#tomp3" } });

    const audio = await nextWith(owner, "audioMessage", 60_000);
    expect(audio.mimetype).toBe("audio/mpeg");
  }, 70_000);
});

describe("commands ported from the Go bot", () => {
  test("#say sends text and #repo links the source", async () => {
    await owner.sendConversation("#say hello world");
    expect(await nextText(owner)).toBe("hello world");

    await owner.sendConversation("#repo");
    expect(await nextText(owner)).toContain("github.com/shellhaki/asena");
  }, 30_000);

  test("#say is only for owner and sudo", async () => {
    await stranger.sendConversation("#say hi");
    expect(await nextText(stranger)).not.toBe("hi");
  }, 30_000);

  test("#filter replies to a word in every chat", async () => {
    await owner.sendConversation("#filter add global hey asena = Hello from the filter!");
    expect(await nextText(owner)).toContain("saved");

    await stranger.sendConversation("well hey asena");
    expect(await nextText(stranger)).toBe("Hello from the filter!");

    await owner.sendConversation("#filter del global hey asena");
    expect(await nextText(owner)).toContain("removed");
    await stranger.sendConversation("hey asena");
    await expectSilence(stranger);
  }, 30_000);

  test("#ban stops someone using commands until #unban", async () => {
    await owner.sendConversation(`#ban ${STRANGER}`);
    expect(await nextText(owner)).toContain("can no longer use commands");
    await stranger.sendConversation("#repo");
    await expectSilence(stranger);

    await owner.sendConversation(`#unban ${STRANGER}`);
    expect(await nextText(owner)).toContain("can use commands again");
    await stranger.sendConversation("#repo");
    expect(await nextText(stranger)).toContain("github.com");
  }, 30_000);

  test("#prefix changes the prefix at runtime", async () => {
    await owner.sendConversation("#prefix !");
    expect(await nextText(owner)).toContain("Prefix is now `!`");

    await owner.sendConversation("!repo");
    expect(await nextText(owner)).toContain("github.com");
    await owner.sendConversation("#repo");
    await expectSilence(owner);

    await owner.sendConversation("!prefix #");
    expect(await nextText(owner)).toContain("Prefix is now `#`");
  }, 30_000);

  test("#afk answers people who message the bot", async () => {
    await owner.sendConversation("#afk at the gym");
    expect(await nextText(owner)).toContain("AFK on");

    await stranger.sendConversation("are you there?");
    expect(await nextText(stranger)).toContain("at the gym");

    await owner.sendConversation("#afk off");
    expect(await nextText(owner)).toContain("AFK off");
  }, 30_000);

  test("#autoread and #antiword usage", async () => {
    await owner.sendConversation("#autoread");
    expect(await nextText(owner)).toContain("Auto read:");

    await owner.sendConversation("#antiword add x");
    expect(await nextText(owner)).toContain("only works in groups");
  }, 30_000);
});

describe("commands from Levanter and Queen Elisa", () => {
  test("budget records income and expenses", async () => {
    await owner.sendConversation("#income 5000 salary");
    expect(await nextText(owner)).toContain("Income of 5,000 saved");
    await owner.sendConversation("#expense 1200 food");
    expect(await nextText(owner)).toContain("Expense of 1,200 saved");
    await owner.sendConversation("#budget");
    const summary = await nextText(owner);
    expect(summary).toContain("Balance: 3,800");
    expect(summary).toContain("food");
    await owner.sendConversation("#delbudget all");
    expect(await nextText(owner)).toContain("removed");
  }, 30_000);

  test("scheduled messages can be listed and cancelled", async () => {
    await owner.sendConversation("#setschedule 2h hello later");
    const saved = await nextText(owner);
    const id = saved.match(/id `(\w+)`/)?.[1];
    expect(id).toBeTruthy();
    await owner.sendConversation("#getschedule");
    expect(await nextText(owner)).toContain("hello later");
    await owner.sendConversation(`#delschedule ${id}`);
    expect(await nextText(owner)).toContain("cancelled");
  }, 30_000);

  test("tic-tac-toe plays a full game", async () => {
    await owner.sendConversation(`#ttt @${STRANGER}`);
    expect(await nextText(owner)).toContain("Tic-tac-toe");
    await owner.sendConversation("#ttt end");
    expect(await nextText(owner)).toContain("Game ended");
  }, 30_000);

  test("math quiz accepts the right answer", async () => {
    await owner.sendConversation("#math easy");
    const question = await nextText(owner);
    const [, a, op, b] = question.match(/(\d+) ([+\-×÷]) (\d+)/) ?? [];
    const x = Number(a), y = Number(b);
    const answer = op === "+" ? x + y : op === "-" ? x - y : op === "×" ? x * y : x / y;
    await owner.sendConversation(String(answer));
    expect(await nextText(owner)).toContain("got it");
  }, 30_000);

  test("antidelete and allowcmd settings", async () => {
    await owner.sendConversation("#antidelete chat");
    expect(await nextText(owner)).toContain("Anti-delete: chat");
    await owner.sendConversation("#antidelete off");
    expect(await nextText(owner)).toContain("Anti-delete: off");
    await owner.sendConversation("#allowcmd add sticker");
    expect(await nextText(owner)).toContain("#sticker");
    await owner.sendConversation("#allowcmd del sticker");
    expect(await nextText(owner)).toContain("owner-only");
  }, 30_000);
});

describe("group commands", () => {
  const GROUP = "120363000000000001@g.us";

  async function nextGroupText(peer: FakePeer): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const received = await peer.expectGroupMessage(GROUP, { timeoutMs: 10_000, senderJid: BOT_DEVICE });
      const text = textOf(received.message);
      if (text) return text;
    }
    throw new Error("No text message arrived in the group.");
  }

  test("#groupinfo shows the group, admin commands check admin rights", async () => {
    server.createFakeGroup({ groupJid: GROUP, subject: "Test Group", participants: [owner, stranger] });

    await owner.sendGroupConversation(GROUP, "#groupinfo");
    expect(await nextGroupText(owner)).toContain("Test Group");

    await stranger.sendGroupConversation(GROUP, "#kick @someone");
    expect(await nextGroupText(stranger)).toContain("only for group admins");

    await stranger.sendGroupConversation(GROUP, "#invite");
    expect(await nextGroupText(stranger)).toContain("only for group admins");

    await stranger.sendGroupConversation(GROUP, "#gcall");
    expect(await nextGroupText(stranger)).toContain("only for group admins");
  }, 60_000);
});
