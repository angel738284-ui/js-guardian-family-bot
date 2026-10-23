import { config } from "../config.ts";
import { command } from "../core/command.ts";
import { addScheduledMessage, getScheduledMessages, removeScheduledMessage } from "../features/scheduledMessages.ts";
import { parseTimeOfDay } from "../lib/args.ts";
import { parseWhen } from "../lib/format.ts";

command({
  name: "setschedule",
  aliases: ["schedule"],
  description: "Send a message here later",
  category: "tools",
  usage: "<10m | 2h | 1d | 18:30> <message>",
  permission: "sudo",
  run: async (ctx) => {
    const [when = "", ...words] = ctx.args.split(/\s+/);
    const at = parseTimeOfDay(when) ?? parseWhen(when);
    const text = words.join(" ") || ctx.message.quoted?.text || "";
    if (!at || !text) {
      await ctx.replyFail(`Usage: \`${config.prefix}setschedule 2h Meeting starts now\` or \`${config.prefix}setschedule 18:30 Good evening\``);
      return;
    }
    const id = Math.random().toString(36).slice(2, 7);
    await addScheduledMessage({ id, chat: ctx.chat, text, at });
    await ctx.replyOk(`Scheduled for ${new Date(at).toLocaleString()} (id \`${id}\`).`);
  },
});

command({
  name: "getschedule",
  aliases: ["schedules"],
  description: "Messages waiting to be sent in this chat",
  category: "tools",
  permission: "sudo",
  run: async (ctx) => {
    const list = (await getScheduledMessages()).filter((item) => item.chat === ctx.chat).sort((a, b) => a.at - b.at);
    if (list.length === 0) {
      await ctx.reply("Nothing scheduled here.");
      return;
    }
    const lines = list.map((item) => `• \`${item.id}\` ${new Date(item.at).toLocaleString()}\n  ${item.text.slice(0, 80)}`);
    await ctx.reply(`*Scheduled*\n${lines.join("\n")}`);
  },
});

command({
  name: "delschedule",
  description: "Cancel a scheduled message",
  category: "tools",
  usage: "<id>",
  permission: "sudo",
  run: async (ctx) => {
    if (!ctx.args || !(await removeScheduledMessage(ctx.args.trim()))) {
      await ctx.replyFail(`Usage: \`${config.prefix}delschedule <id>\` (ids from \`${config.prefix}getschedule\`)`);
      return;
    }
    await ctx.replyOk("Scheduled message cancelled.");
  },
});
