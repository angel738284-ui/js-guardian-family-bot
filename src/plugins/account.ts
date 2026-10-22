import { logoutBot } from "../bot/connection.ts";
import { config } from "../config.ts";
import { command } from "../core/command.ts";
import { isOwnerNumber, listBanned, setBanned } from "../features/access.ts";
import { getAutoSettings, updateAutoSettings } from "../features/automation.ts";
import { savePrefix } from "../features/prefix.ts";
import { shutdown } from "../terminal.ts";
import { MAX_COMMAND_OUTPUT, PRIVACY, SHELL_TIMEOUT_MS } from "../lib/constants.ts";
import { runningShells } from "../lib/shell.ts";

command({
  name: "logout",
  aliases: ["unpair"],
  description: "Log the bot out of WhatsApp",
  category: "owner",
  usage: "confirm",
  permission: "owner",
  audit: true,
  run: async (ctx) => {
    if (ctx.args.toLowerCase() !== "confirm") {
      await ctx.reply(`This unlinks the bot from WhatsApp. You will need to pair again.\nSend \`${config.prefix}logout confirm\` to do it.`);
      return;
    }
    await ctx.reply("Logging out. Bye 👋");
    await logoutBot();
    await shutdown(0, false);
  },
});

command({
  name: "presence",
  aliases: ["setonline"],
  description: "Show the bot as online or offline",
  category: "owner",
  usage: "online | offline",
  permission: "sudo",
  run: async (ctx) => {
    const wanted = ctx.args.toLowerCase();
    if (wanted !== "online" && wanted !== "offline") {
      await ctx.replyFail(`Usage: \`${config.prefix}presence online | offline\``);
      return;
    }
    await ctx.client.presence.send(wanted === "online" ? "available" : "unavailable");
    await ctx.replyOk(`The bot shows as ${wanted}.`);
  },
});

command({
  name: "bio",
  aliases: ["setbio"],
  description: "Change the bot's WhatsApp about text",
  category: "owner",
  usage: "<text>",
  permission: "sudo",
  run: async (ctx) => {
    if (!ctx.args) {
      await ctx.replyFail(`Usage: \`${config.prefix}bio <text>\``);
      return;
    }
    await ctx.client.profile.setStatus(ctx.args.slice(0, 139));
    await ctx.replyOk("Bio updated.");
  },
});

command({
  name: "pp",
  aliases: ["setpp"],
  description: "Change the bot's profile photo (reply to an image)",
  category: "owner",
  usage: "(reply to an image) | remove",
  permission: "sudo",
  run: async (ctx) => {
    if (ctx.args.toLowerCase() === "remove") {
      await ctx.client.profile.deleteProfilePicture();
      await ctx.replyOk("Profile photo removed.");
      return;
    }
    const media = await ctx.downloadMedia();
    if (!media || media.type !== "image") {
      await ctx.replyFail("Reply to an image.");
      return;
    }
    await ctx.client.profile.setProfilePicture(media.bytes);
    await ctx.replyOk("Profile photo updated.");
  },
});

command({
  name: "privacy",
  aliases: ["myprivacy"],
  description: "View or change WhatsApp privacy settings",
  category: "owner",
  usage: "[setting value], e.g. lastseen contacts",
  permission: "owner",
  run: async (ctx) => {
    const [name = "", value = ""] = ctx.args.toLowerCase().split(/\s+/);
    const entry = PRIVACY[name];

    if (!entry) {
      const current = await ctx.client.privacy.getPrivacySettings();
      const lines = Object.entries(PRIVACY).map(([key, item]) => `• *${key}*: ${current[item.setting] ?? "?"}  _(${item.values.join(", ")})_`);
      await ctx.reply(`*Privacy*\n${lines.join("\n")}\n\n_Change one: \`${config.prefix}privacy lastseen contacts\`_`);
      return;
    }
    if (!entry.values.includes(value)) {
      await ctx.replyFail(`*${name}* can be: ${entry.values.join(", ")}`);
      return;
    }
    // value is checked against entry.values above.
    await ctx.client.privacy.setPrivacySetting(entry.setting, value as never);
    await ctx.replyOk(`${name} set to ${value}.`);
  },
});

command({
  name: "ban",
  description: "Stop someone from using the bot's commands",
  category: "owner",
  usage: "@user | reply | number | list",
  permission: "sudo",
  audit: true,
  run: async (ctx) => {
    if (ctx.args.toLowerCase() === "list") {
      const banned = await listBanned();
      await ctx.reply(banned.length ? `*Banned (${banned.length})*\n${banned.map((id) => `• ${id}`).join("\n")}` : "*Banned:* _(nobody)_");
      return;
    }
    const target = ctx.target() ?? ctx.args.replace(/\D/g, "");
    if (!target) {
      await ctx.replyFail("Mention, reply to or give the number of the person to ban.");
      return;
    }
    await ctx.replyOk(`${await setBanned(target, true)} can no longer use commands.`);
  },
});

command({
  name: "unban",
  description: "Let a banned person use commands again",
  category: "owner",
  usage: "@user | reply | number",
  permission: "sudo",
  audit: true,
  run: async (ctx) => {
    const target = ctx.target() ?? ctx.args.replace(/\D/g, "");
    if (!target) {
      await ctx.replyFail("Mention, reply to or give the number of the person to unban.");
      return;
    }
    await ctx.replyOk(`${await setBanned(target, false)} can use commands again.`);
  },
});

command({
  name: "prefix",
  description: "View or change the command prefix",
  category: "owner",
  usage: "[new prefix]",
  permission: "owner",
  audit: true,
  run: async (ctx) => {
    if (!ctx.args) {
      await ctx.reply(`*Prefix:* \`${config.prefix}\`\n_Change it with \`${config.prefix}prefix !\`._`);
      return;
    }
    try {
      await savePrefix(ctx.args.trim());
      await ctx.replyOk(`Prefix is now \`${config.prefix}\`. Try \`${config.prefix}menu\`.`);
    } catch (error) {
      await ctx.replyFail(error instanceof Error ? error.message : String(error));
    }
  },
});

command({
  name: "autobio",
  description: "Keep the time and a quote in the bot's about text",
  category: "owner",
  usage: "[on|off]",
  permission: "sudo",
  run: async (ctx) => {
    const current = (await getAutoSettings()).autobio;
    const enabled = ctx.args.toLowerCase() === "on" ? true : ctx.args.toLowerCase() === "off" ? false : !current;
    await updateAutoSettings({ autobio: enabled });
    await ctx.replyOk(`Auto bio: ${enabled ? "ON (updates every 10 minutes)" : "OFF"}`);
  },
});

command({
  name: "sh",
  aliases: ["shell", "exec"],
  description: "Run a terminal command on the bot's machine",
  category: "owner",
  usage: "<command>",
  permission: "owner",
  hidden: true,
  audit: true,
  run: async (ctx) => {
    if (!config.enableEval || !isOwnerNumber(ctx)) {
      await ctx.replyFail(config.enableEval ? "Only an OWNER_NUMBER can use this." : "Shell is off. Set ENABLE_EVAL=true in .env and restart.");
      return;
    }
    if (!ctx.args) {
      await ctx.replyFail(`Usage: \`${config.prefix}sh ls -la\``);
      return;
    }
    if (runningShells.has(ctx.chat)) {
      await ctx.replyFail(`A command is still runningShells here. Stop it with \`${config.prefix}stop\`.`);
      return;
    }

    const proc = Bun.spawn(["sh", "-c", ctx.args], { stdout: "pipe", stderr: "pipe" });
    runningShells.set(ctx.chat, proc);
    const timer = setTimeout(() => proc.kill(), SHELL_TIMEOUT_MS);

    try {
      const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
      const output = `${out}${err}`.trim() || "(no output)";
      const clipped = output.length > MAX_COMMAND_OUTPUT ? `${output.slice(0, MAX_COMMAND_OUTPUT)}\n… (cut)` : output;
      await ctx.reply(`\`\`\`${clipped}\`\`\`\n_exit ${code}_`);
    } finally {
      clearTimeout(timer);
      runningShells.delete(ctx.chat);
    }
  },
});

command({
  name: "stop",
  aliases: ["kill"],
  description: "Stop the terminal command runningShells in this chat",
  category: "owner",
  permission: "owner",
  hidden: true,
  run: async (ctx) => {
    const proc = runningShells.get(ctx.chat);
    if (!proc) {
      await ctx.reply("Nothing is runningShells here.");
      return;
    }
    proc.kill();
    await ctx.replyOk("Stopped.");
  },
});

