import os from "node:os";
import { config } from "../config.ts";
import { botIdentity } from "../bot/client.ts";
import { command } from "../core/command.ts";
import { getMode, isPrivileged } from "../features/access.ts";
import { getLanguage } from "../features/i18n.ts";
import { getLogGroupJid, isSetupDone } from "../features/logGroup.ts";
import { formatUptime } from "../lib/format.ts";
import { isLidJid } from "../lib/jid.ts";
import { hasFfmpeg } from "../lib/media.ts";

command({
  name: "info",
  description: "Chat and message details",
  category: "system",
  run: async (ctx) => {
    const key = ctx.event.key;
    const lines = [
      `› *Message information*`,
      ``,
      `*Chat type:* ${ctx.isGroup ? "Group" : "Private chat"}`,
      `*Chat ID:* ${ctx.chat}`,
    ];
    if (key.remoteJidAlt) lines.push(`*Chat ID (alt):* ${key.remoteJidAlt}`);

    const primary = (ctx.isGroup ? key.participant : key.remoteJid) ?? "";
    const alternate = ctx.isGroup ? key.participantAlt : key.remoteJidAlt;
    lines.push(
      ``,
      `*Sender:* ${ctx.pushName || "Unknown"}`,
      `*Sender ID:* ${primary}`,
      ...(alternate ? [`*Sender ID (alt):* ${alternate}`] : []),
      `*ID type:* ${isLidJid(primary) ? "LID (private ID)" : "Phone number"}`,
      ``,
      `*Message type:* ${ctx.message.type}`,
      `*Message ID:* ${key.id}`,
      `*Is a reply:* ${ctx.message.quoted ? "yes" : "no"}`,
    );

    if (ctx.isGroup) {
      try {
        const group = await ctx.group();
        lines.push(``, `*Group:* ${group.subject}`, `*Members:* ${group.participants.length}`);
        if (group.owner) lines.push(`*Owner:* ${group.ownerPhoneNumber ?? group.owner}`);
      } catch {
        lines.push(``, `_Could not load group details._`);
      }
    }

    await ctx.reply(lines.join("\n"));
  },
});

command({
  name: "status",
  aliases: ["uptime", "runtime"],
  description: "Bot health: uptime, mode, FFmpeg",
  category: "system",
  run: async (ctx) => {
    const lines = [
      `*${config.botName}* v${config.version}`,
      `• Uptime: ${formatUptime(process.uptime())}`,
      `• Mode: ${await getMode()}`,
      `• Language: ${getLanguage()}`,
      `• FFmpeg: ${(await hasFfmpeg()) ? "✓" : "✕"}`,
      `• Setup: ${(await isSetupDone()) ? "done" : "pending"}`,
    ];

    if (await isPrivileged(ctx)) {
      lines.push(
        `• Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
        `• Runtime: Bun ${Bun.version} on ${os.platform()}`,
        `• Database: ${config.database.usePostgres ? "Postgres" : "SQLite"}`,
        `• Log group: ${getLogGroupJid() ?? "_(not set)_"}`,
        `• Logged in as: ${botIdentity().jid ?? "?"}`,
      );
    }

    await ctx.reply(lines.join("\n"));
  },
});
