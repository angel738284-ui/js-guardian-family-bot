import { send } from "../bot/client.ts";
import { config } from "../config.ts";
import { command } from "../core/command.ts";
import { forgetGroup, getGroup } from "../features/groups.ts";
import { getGroupStats } from "../features/groupStats.ts";
import { selfChat } from "../features/automation.ts";
import { personFor, quotedKey } from "../lib/ctx.ts";
import { mentionTag, normalizeId, phoneToJid, userPart } from "../lib/jid.ts";
import { readStickerInfo } from "../lib/sticker.ts";
import { getBytes, lyrics, qrImageUrl, readQr, screenshotUrl, translate, weather } from "../lib/web.ts";

command({
  name: "forward",
  description: "Forward the replied message to a number or chat",
  category: "tools",
  usage: "<number | jid> (reply to a message)",
  permission: "sudo",
  run: async (ctx) => {
    const quoted = ctx.message.quoted;
    const raw = ctx.args.trim();
    const to = raw.includes("@") ? raw : raw.replace(/\D/g, "").length >= 7 ? phoneToJid(raw) : null;
    if (!quoted || !to) {
      await ctx.replyFail(`Reply to a message with \`${config.prefix}forward 2348012345678\``);
      return;
    }
    await send(to, quoted.content, { forward: true });
    await ctx.react("✅");
  },
});

command({
  name: "save",
  description: "Save the replied message to your own chat",
  category: "tools",
  usage: "(reply to a message)",
  permission: "sudo",
  run: async (ctx) => {
    const me = selfChat();
    if (!ctx.message.quoted || !me) {
      await ctx.replyFail("Reply to the message you want to save.");
      return;
    }
    await send(me, ctx.message.quoted.content);
    await ctx.react("💾");
  },
});

command({
  name: "react",
  description: "React to the replied message",
  category: "tools",
  usage: "<emoji> (reply to a message)",
  run: async (ctx) => {
    const key = quotedKey(ctx);
    if (!key || !ctx.args) {
      await ctx.replyFail(`Reply to a message with \`${config.prefix}react 🔥\``);
      return;
    }
    await send(ctx.chat, { type: "reaction", emoji: ctx.args.trim(), target: key });
  },
});

command({
  name: "ison",
  description: "Check which numbers are on WhatsApp",
  category: "tools",
  usage: "<number> [number...]",
  run: async (ctx) => {
    const numbers = ctx.args.split(/[\s,]+/).map((item) => item.replace(/\D/g, "")).filter((item) => item.length >= 7).slice(0, 20);
    if (numbers.length === 0) {
      await ctx.replyFail(`Usage: \`${config.prefix}ison 2348012345678\``);
      return;
    }
    const results = await ctx.client.profile.getLidsByPhoneNumbers(numbers);
    const lines = results.map((result) => `${result.exists ? "✅" : "❌"} +${userPart(result.phoneJid)}${result.invalid ? " (invalid)" : ""}`);
    await ctx.reply(`*On WhatsApp?*\n${lines.join("\n")}`);
  },
});

command({
  name: "getexif",
  aliases: ["stickerinfo"],
  description: "Show a sticker's pack name and author",
  category: "media",
  usage: "(reply to a sticker)",
  run: async (ctx) => {
    const media = await ctx.downloadMedia();
    if (!media || media.type !== "sticker") {
      await ctx.replyFail("Reply to a sticker.");
      return;
    }
    const info = await readStickerInfo(media.bytes);
    await ctx.reply(info ? `*Pack:* ${info.pack || "–"}\n*Author:* ${info.author || "–"}` : "This sticker has no pack info.");
  },
});

command({
  name: "qr",
  description: "Make a QR code, or read one from an image",
  category: "tools",
  usage: "<text> | (reply to a QR image)",
  run: async (ctx) => {
    if (!ctx.args) {
      const media = await ctx.downloadMedia();
      if (!media || media.type !== "image") {
        await ctx.replyFail(`Usage: \`${config.prefix}qr <text>\`, or reply to a QR image to read it.`);
        return;
      }
      const text = await readQr(media.bytes);
      await ctx.reply(text ? `*QR code says:*\n${text}` : "I could not find a QR code in that image.");
      return;
    }
    const image = await getBytes(qrImageUrl(ctx.args));
    await ctx.send({ type: "image", media: image.bytes, mimetype: "image/png", caption: ctx.args.slice(0, 200) });
  },
});

command({
  name: "trt",
  aliases: ["translate", "tr"],
  description: "Translate text (reply to a message or type it)",
  category: "tools",
  usage: "<language code> [text], e.g. fr hello",
  run: async (ctx) => {
    const [lang = "", ...words] = ctx.args.split(/\s+/);
    const text = words.join(" ") || ctx.message.quoted?.text || "";
    if (!/^[a-z]{2}(-[a-z]{2,4})?$/i.test(lang) || !text) {
      await ctx.replyFail(`Usage: \`${config.prefix}trt fr Good morning\`, or reply to a message with \`${config.prefix}trt en\``);
      return;
    }
    const result = await translate(text, lang.toLowerCase());
    await ctx.reply(`${result.text}\n\n_${result.from} → ${lang.toLowerCase()}_`);
  },
});

command({
  name: "weather",
  description: "Current weather for a city",
  category: "tools",
  usage: "<city>",
  run: async (ctx) => {
    if (!ctx.args) {
      await ctx.replyFail(`Usage: \`${config.prefix}weather Lagos\``);
      return;
    }
    const now = await weather(ctx.args);
    await ctx.reply(
      `*${now.place}*\n${now.description}\n🌡️ ${now.tempC}°C (feels ${now.feelsC}°C)\n💧 ${now.humidity}% humidity\n💨 ${now.windKmh} km/h wind`,
    );
  },
});

command({
  name: "ss",
  aliases: ["fullss", "screenshot"],
  description: "Screenshot a web page (fullss for the whole page)",
  category: "tools",
  usage: "<url>",
  run: async (ctx) => {
    const url = ctx.args.match(/https?:\/\/\S+/)?.[0];
    if (!url) {
      await ctx.replyFail(`Usage: \`${config.prefix}ss https://example.com\``);
      return;
    }
    const image = await ctx.withTyping(() => getBytes(screenshotUrl(url, ctx.command === "fullss")));
    await ctx.send({ type: "image", media: image.bytes, mimetype: "image/png", caption: url });
  },
});

command({
  name: "upload",
  aliases: ["fetch"],
  description: "Download a file from a link and send it here",
  category: "media",
  usage: "<url>",
  run: async (ctx) => {
    const url = (ctx.args || ctx.message.quoted?.text || "").match(/https?:\/\/\S+/)?.[0];
    if (!url) {
      await ctx.replyFail(`Usage: \`${config.prefix}upload https://.../file.jpg\``);
      return;
    }
    const file = await ctx.withTyping(() => getBytes(url));
    if (file.bytes.length > config.limits.maxVideoBytes) {
      await ctx.replyFail("That file is too big.");
      return;
    }
    const type = file.type.split(";")[0] ?? "";
    if (type.startsWith("image/")) await ctx.send({ type: "image", media: file.bytes, mimetype: type });
    else if (type.startsWith("video/")) await ctx.send({ type: "video", media: file.bytes, mimetype: type });
    else if (type.startsWith("audio/")) await ctx.send({ type: "audio", media: file.bytes, mimetype: type });
    else await ctx.send({ type: "document", media: file.bytes, mimetype: type || "application/octet-stream", fileName: url.split("/").pop()?.split("?")[0] || "file" });
  },
});

command({
  name: "lyrics",
  aliases: ["lyric"],
  description: "Song lyrics",
  category: "media",
  usage: "<artist and song>",
  run: async (ctx) => {
    if (!ctx.args) {
      await ctx.replyFail(`Usage: \`${config.prefix}lyrics adele hello\``);
      return;
    }
    const song = await ctx.withTyping(() => lyrics(ctx.args));
    if (!song) {
      await ctx.reply("No lyrics found.");
      return;
    }
    await ctx.reply(`*${song.title}* · ${song.artist}\n\n${song.text.slice(0, 3_500)}`);
  },
});

command({
  name: "jid",
  description: "Show the WhatsApp ID of a person or this chat",
  category: "tools",
  usage: "[@user | reply]",
  run: async (ctx) => {
    await ctx.reply(personFor(ctx) ?? ctx.chat);
  },
});

command({
  name: "gjid",
  description: "List the groups the bot is in, with their IDs",
  category: "owner",
  permission: "sudo",
  run: async (ctx) => {
    const groups = await ctx.client.group.queryAllGroups();
    const lines = groups.map((group) => `• *${group.subject}* (${group.participants.length})\n  ${group.jid}`);
    await ctx.reply(lines.length ? `*Groups (${groups.length})*\n${lines.join("\n")}` : "The bot is in no groups.");
  },
});

command({
  name: "revoke",
  aliases: ["resetlink"],
  description: "Reset the group invite link",
  category: "group",
  adminOnly: true,
  botAdmin: true,
  run: async (ctx) => {
    await ctx.client.group.revokeInvite(ctx.chat);
    const code = await ctx.client.group.queryInviteCode(ctx.chat);
    await ctx.replyOk(`Invite link reset:\nhttps://chat.whatsapp.com/${code}`);
  },
});

command({
  name: "ginfo",
  description: "Details of a group from its invite link",
  category: "group",
  usage: "<invite link>",
  run: async (ctx) => {
    const code = (ctx.args || ctx.message.quoted?.text || "").match(/chat\.whatsapp\.com\/([A-Za-z0-9]{10,})/)?.[1];
    if (!code) {
      await ctx.replyFail(`Usage: \`${config.prefix}ginfo https://chat.whatsapp.com/...\``);
      return;
    }
    const info = await ctx.client.group.queryGroupInviteInfo(code);
    const lines = [`*${info.subject}*`, `• Members: ${info.size ?? "?"}`, `• ID: ${info.jid}`];
    if (info.creation) lines.push(`• Created: ${new Date(info.creation * 1000).toLocaleDateString()}`);
    if (info.desc) lines.push("", info.desc);
    await ctx.reply(lines.join("\n"));
  },
});

command({
  name: "common",
  description: "Members this group shares with another group; add kick to remove them here",
  category: "group",
  usage: "<group jid> [kick]",
  adminOnly: true,
  run: async (ctx) => {
    const [otherJid = "", action = ""] = ctx.args.split(/\s+/);
    if (!otherJid.endsWith("@g.us")) {
      await ctx.replyFail(`Usage: \`${config.prefix}common 1203...@g.us [kick]\` (see \`${config.prefix}gjid\`)`);
      return;
    }
    const [here, other] = await Promise.all([ctx.group(), getGroup(otherJid)]);
    const otherIds = new Set(other.participants.flatMap((p) => [p.jid, p.lid, p.phoneNumber].filter(Boolean).map(normalizeId)));
    const shared = here.participants.filter((p) => !p.isAdmin && !p.isSuperAdmin && [p.jid, p.lid, p.phoneNumber].some((id) => id && otherIds.has(normalizeId(id))));

    if (action.toLowerCase() === "kick" && shared.length) {
      await ctx.client.group.removeParticipants(ctx.chat, shared.map((p) => p.jid));
      forgetGroup(ctx.chat);
      await ctx.replyOk(`Removed ${shared.length} shared members.`);
      return;
    }
    const jids = shared.map((p) => p.jid);
    await ctx.reply(jids.length ? `*Also in ${other.subject} (${jids.length})*\n${jids.map((jid) => `• ${mentionTag(jid)}`).join("\n")}` : "No shared members.", { mentions: jids });
  },
});

command({
  name: "inactive",
  description: "Members who have not sent a message since stats started",
  category: "group",
  usage: "[kick]",
  adminOnly: true,
  run: async (ctx) => {
    const [group, stats] = await Promise.all([ctx.group(), getGroupStats(ctx.chat)]);
    const active = new Set(Object.keys(stats.members));
    const quiet = group.participants.filter((p) => !p.isAdmin && !p.isSuperAdmin && ![p.jid, p.lid, p.phoneNumber].some((id) => id && active.has(normalizeId(id))));
    const since = new Date(stats.since).toLocaleDateString();

    if (ctx.args.toLowerCase() === "kick" && quiet.length) {
      await ctx.client.group.removeParticipants(ctx.chat, quiet.map((p) => p.jid));
      forgetGroup(ctx.chat);
      await ctx.replyOk(`Removed ${quiet.length} inactive members.`);
      return;
    }
    const jids = quiet.map((p) => p.jid);
    await ctx.reply(jids.length ? `*Silent since ${since} (${jids.length})*\n${jids.map((jid) => `• ${mentionTag(jid)}`).join("\n")}` : `Everyone has spoken since ${since}.`, { mentions: jids });
  },
});
