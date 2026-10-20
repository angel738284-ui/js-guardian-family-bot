import { describe, expect, test } from "bun:test";
import { splitCommand } from "../src/core/command.ts";
import { parseMessage } from "../src/core/message.ts";
import { TtlCache } from "../src/lib/cache.ts";
import { formatDuration, formatUptime, parseWhen, wrapText } from "../src/lib/format.ts";
import { mentionTag, normalizeId, userPart } from "../src/lib/jid.ts";

describe("splitCommand", () => {
  test("splits name and arguments", () => {
    expect(splitCommand("#ytmp3 never gonna", "#")).toEqual({ name: "ytmp3", args: "never gonna" });
  });

  test("allows a space after the prefix and ignores case", () => {
    expect(splitCommand("#  PING", "#")).toEqual({ name: "ping", args: "" });
  });

  test("keeps new lines inside arguments", () => {
    expect(splitCommand("#welcome Hi @user\nEnjoy", "#")?.args).toBe("Hi @user\nEnjoy");
  });

  test("returns null for normal text", () => {
    expect(splitCommand("hello #ping", "#")).toBeNull();
    expect(splitCommand("#", "#")).toBeNull();
  });
});

describe("parseMessage", () => {
  test("plain text", () => {
    const parsed = parseMessage({ conversation: "hi" });
    expect(parsed?.type).toBe("text");
    expect(parsed?.text).toBe("hi");
    expect(parsed?.quoted).toBeNull();
  });

  test("image caption inside a view-once wrapper", () => {
    const parsed = parseMessage({ viewOnceMessageV2: { message: { imageMessage: { caption: "#sticker" } } } });
    expect(parsed?.type).toBe("image");
    expect(parsed?.text).toBe("#sticker");
  });

  test("reply with mentions and a quoted sticker", () => {
    const parsed = parseMessage({
      extendedTextMessage: {
        text: "#take",
        contextInfo: {
          mentionedJid: ["1@s.whatsapp.net"],
          participant: "2@s.whatsapp.net",
          stanzaId: "ABC",
          quotedMessage: { stickerMessage: { mimetype: "image/webp" } },
        },
      },
    });
    expect(parsed?.mentions).toEqual(["1@s.whatsapp.net"]);
    expect(parsed?.quoted?.type).toBe("sticker");
    expect(parsed?.quoted?.sender).toBe("2@s.whatsapp.net");
    expect(parsed?.quoted?.id).toBe("ABC");
  });

  test("ignores system messages", () => {
    expect(parseMessage({ protocolMessage: {} })).toBeNull();
    expect(parseMessage(undefined)).toBeNull();
  });
});

describe("JID helpers", () => {
  test("userPart strips the server and device", () => {
    expect(userPart("919876543210:12@s.whatsapp.net")).toBe("919876543210");
  });

  test("normalizeId keeps digits, works for LIDs too", () => {
    expect(normalizeId("+91 98765-43210")).toBe("919876543210");
    expect(normalizeId("123456789@lid")).toBe("123456789");
    expect(normalizeId(null)).toBe("");
  });

  test("mentionTag", () => {
    expect(mentionTag("919876543210@s.whatsapp.net")).toBe("@919876543210");
  });
});

describe("format helpers", () => {
  test("formatUptime", () => {
    expect(formatUptime(0)).toBe("0s");
    expect(formatUptime(3725)).toBe("1h 2m 5s");
    expect(formatUptime(90_000)).toBe("1d 1h");
  });

  test("formatDuration", () => {
    expect(formatDuration(185)).toBe("3:05");
  });

  test("parseWhen understands relative times", () => {
    const now = Date.now();
    expect(parseWhen("10m")! - now).toBeGreaterThanOrEqual(10 * 60_000 - 50);
    expect(parseWhen("2h")! - now).toBeGreaterThanOrEqual(2 * 3_600_000 - 50);
    expect(parseWhen("soon")).toBeNull();
    expect(parseWhen("2001-01-01")).toBeNull();
  });

  test("wrapText respects the line length", () => {
    const lines = wrapText("the quick brown fox jumps over the lazy dog", 10);
    expect(lines.every((line) => line.length <= 10)).toBe(true);
    expect(lines.join(" ")).toBe("the quick brown fox jumps over the lazy dog");
    expect(wrapText("aaaaaaaaaaaaaaa", 5)).toEqual(["aaaaa", "aaaaa", "aaaaa"]);
  });
});

describe("TtlCache", () => {
  test("drops the least recently used entry when full", () => {
    const cache = new TtlCache<number>(60_000, 2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
  });

  test("expires entries", async () => {
    const cache = new TtlCache<number>(10, 5);
    cache.set("a", 1);
    await Bun.sleep(20);
    expect(cache.get("a")).toBeUndefined();
  });
});
