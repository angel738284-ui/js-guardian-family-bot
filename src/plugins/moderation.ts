import { config } from "../config.ts";
import { command, findCommand } from "../core/command.ts";
import {
  addWarn,
  getGroupSettings,
  getWarns,
  resetWarns,
  updateGroupSettings,
} from "../features/groupSettings.ts";
import { forgetGroup } from "../features/groups.ts";
import { t } from "../features/i18n.ts";
import { mentionTag, normalizeId } from "../lib/jid.ts";
import { nextValue, onOff } from "../lib/args.ts";
import { messageToggle, requireTarget } from "../lib/group.ts";
import { ALWAYS_ON, PRESETS } from "../lib/constants.ts";

command({
  name: "welcome",
  description: "Welcome messages",
  category: "group",
  usage: "[on|off|text with @user @group @count]",
  adminOnly: true,
  run: (ctx) => messageToggle(ctx, "welcome", "welcomeText"),
});

command({
  name: "goodbye",
  description: "Goodbye messages",
  category: "group",
  usage: "[on|off|text with @user @group @count]",
  adminOnly: true,
  run: (ctx) => messageToggle(ctx, "goodbye", "goodbyeText"),
});

command({
  name: "antilink",
  description: "Delete messages with links",
  category: "group",
  usage: "[on|off]",
  adminOnly: true,
  botAdmin: true,
  flag: "moderation",
  run: async (ctx) => {
    const settings = await getGroupSettings(ctx.chat);
    const next = await updateGroupSettings(ctx.chat, { antilink: nextValue(ctx.args, settings.antilink) });
    await ctx.replyOk(`Anti-link: *${onOff(next.antilink)}*`);
  },
});

command({
  name: "antispam",
  description: "Delete spam messages",
  category: "group",
  usage: "[on|off]",
  adminOnly: true,
  botAdmin: true,
  flag: "moderation",
  run: async (ctx) => {
    const settings = await getGroupSettings(ctx.chat);
    const next = await updateGroupSettings(ctx.chat, { antispam: nextValue(ctx.args, settings.antispam) });
    await ctx.replyOk(
      `Anti-spam: *${onOff(next.antispam)}* (more than ${next.antispamLimit} messages in ${next.antispamWindowMs / 1000}s)`,
    );
  },
});

command({
  name: "groupsettings",
  description: "Show this group's bot settings",
  category: "group",
  adminOnly: true,
  run: async (ctx) => {
    const s = await getGroupSettings(ctx.chat);
    await ctx.reply(
      [
        `*Group settings*`,
        `• Welcome: ${onOff(s.welcome)}`,
        `• Goodbye: ${onOff(s.goodbye)}`,
        `• Anti-link: ${onOff(s.antilink)}`,
        `• Anti-spam: ${onOff(s.antispam)}`,
        `• Warn limit: ${s.warnLimit}`,
        `• Muted members: ${s.muted.length}`,
        `• Disabled commands: ${s.disabledCommands.join(", ") || "none"}`,
      ].join("\n"),
    );
  },
});

command({
  name: "groupsetup",
  description: "Apply a moderation preset",
  category: "group",
  usage: "recommended|minimal|off",
  adminOnly: true,
  run: async (ctx) => {
    const preset = PRESETS[ctx.args.toLowerCase()];
    if (!preset) {
      const p = config.prefix;
      await ctx.reply(
        `*Group setup*\n\n` +
          `\`${p}groupsetup recommended\` – welcome, goodbye, anti-link, anti-spam ON\n` +
          `\`${p}groupsetup minimal\` – welcome only\n` +
          `\`${p}groupsetup off\` – all off\n\n` +
          `Fine-tune later with \`${p}groupsettings\`. Anti-link and anti-spam need the bot to be admin.`,
      );
      return;
    }
    await updateGroupSettings(ctx.chat, preset);
    await ctx.replyOk(`Applied the *${ctx.args.toLowerCase()}* preset.`);
  },
});

command({
  name: "warn",
  description: "Warn a member",
  category: "group",
  usage: "@user",
  adminOnly: true,
  botAdmin: true,
  flag: "moderation",
  audit: true,
  run: async (ctx) => {
    const target = await requireTarget(ctx);
    if (!target) return;

    const settings = await getGroupSettings(ctx.chat);
    const count = await addWarn(ctx.chat, normalizeId(target));
    const tag = mentionTag(target);
    await ctx.reply(t("WARNED", { user: tag, count, limit: settings.warnLimit }), { mentions: [target] });

    if (count < settings.warnLimit) return;

    const [result] = await ctx.client.group.removeParticipants(ctx.chat, [target]);
    if (result?.status === "ok") {
      await resetWarns(ctx.chat, normalizeId(target));
      forgetGroup(ctx.chat);
      await ctx.reply(t("KICKED_WARNS", { user: tag }), { mentions: [target] });
    } else {
      await ctx.replyFail(`Could not remove ${tag} (code ${result?.code ?? "?"}).`, { mentions: [target] });
    }
  },
});

command({
  name: "unwarn",
  description: "Reset a member's warnings",
  category: "group",
  usage: "@user",
  adminOnly: true,
  run: async (ctx) => {
    const target = await requireTarget(ctx);
    if (!target) return;
    await resetWarns(ctx.chat, normalizeId(target));
    await ctx.replyOk(`Warnings reset for ${mentionTag(target)}`, { mentions: [target] });
  },
});

command({
  name: "warns",
  description: "Show warnings",
  category: "group",
  usage: "[@user]",
  groupOnly: true,
  run: async (ctx) => {
    const target = ctx.target() ?? ctx.sender;
    const settings = await getGroupSettings(ctx.chat);
    const count = await getWarns(ctx.chat, normalizeId(target));
    await ctx.reply(`Warnings for ${mentionTag(target)}: *${count}/${settings.warnLimit}*`, { mentions: [target] });
  },
});

command({
  name: "mute",
  aliases: ["antimsg"],
  description: "Delete every message a member sends",
  category: "group",
  usage: "@user",
  adminOnly: true,
  botAdmin: true,
  flag: "moderation",
  audit: true,
  run: async (ctx) => {
    const target = await requireTarget(ctx);
    if (!target) return;
    const settings = await getGroupSettings(ctx.chat);
    const id = normalizeId(target);
    if (!settings.muted.includes(id)) await updateGroupSettings(ctx.chat, { muted: [...settings.muted, id] });
    await ctx.replyOk(`Muted ${mentionTag(target)}`, { mentions: [target] });
  },
});

command({
  name: "unmute",
  description: "Unmute a member",
  category: "group",
  usage: "@user",
  adminOnly: true,
  audit: true,
  run: async (ctx) => {
    const target = await requireTarget(ctx);
    if (!target) return;
    const settings = await getGroupSettings(ctx.chat);
    const id = normalizeId(target);
    await updateGroupSettings(ctx.chat, { muted: settings.muted.filter((item) => item !== id) });
    await ctx.replyOk(`Unmuted ${mentionTag(target)}`, { mentions: [target] });
  },
});

command({
  name: "kick",
  description: "Remove a member from the group",
  category: "group",
  usage: "@user",
  adminOnly: true,
  botAdmin: true,
  flag: "moderation",
  audit: true,
  run: async (ctx) => {
    const target = await requireTarget(ctx);
    if (!target) return;
    const [result] = await ctx.client.group.removeParticipants(ctx.chat, [target]);
    forgetGroup(ctx.chat);
    if (result?.status === "ok") await ctx.replyOk(`Removed ${mentionTag(target)}`, { mentions: [target] });
    else await ctx.replyFail(`Could not remove ${mentionTag(target)} (code ${result?.code ?? "?"}).`, { mentions: [target] });
  },
});

command({
  name: "disable",
  aliases: ["discmd", "disablecmd"],
  description: "Turn a command off in this group",
  category: "group",
  usage: "<command>",
  adminOnly: true,
  audit: true,
  run: async (ctx) => {
    const cmd = findCommand(ctx.args.replace(config.prefix, ""));
    if (!cmd) {
      await ctx.replyFail(`Usage: \`${config.prefix}disable <command>\``);
      return;
    }
    if (ALWAYS_ON.has(cmd.name)) {
      await ctx.replyFail("That command cannot be disabled.");
      return;
    }
    const settings = await getGroupSettings(ctx.chat);
    if (!settings.disabledCommands.includes(cmd.name)) {
      await updateGroupSettings(ctx.chat, { disabledCommands: [...settings.disabledCommands, cmd.name] });
    }
    await ctx.replyOk(`\`${config.prefix}${cmd.name}\` is now off in this group.`);
  },
});

command({
  name: "enable",
  aliases: ["encmd", "enablecmd"],
  description: "Turn a disabled command back on",
  category: "group",
  usage: "<command>",
  adminOnly: true,
  audit: true,
  run: async (ctx) => {
    const cmd = findCommand(ctx.args.replace(config.prefix, ""));
    if (!cmd) {
      await ctx.replyFail(`Usage: \`${config.prefix}enable <command>\``);
      return;
    }
    const settings = await getGroupSettings(ctx.chat);
    await updateGroupSettings(ctx.chat, { disabledCommands: settings.disabledCommands.filter((name) => name !== cmd.name) });
    await ctx.replyOk(`\`${config.prefix}${cmd.name}\` is on again.`);
  },
});

command({
  name: "disabled",
  aliases: ["plugins"],
  description: "Commands off in this group",
  category: "group",
  groupOnly: true,
  run: async (ctx) => {
    const { disabledCommands } = await getGroupSettings(ctx.chat);
    await ctx.reply(
      disabledCommands.length
        ? `*Off in this group:*\n${disabledCommands.map((name) => `• ${config.prefix}${name}`).join("\n")}`
        : "*Off in this group:* _(none)_",
    );
  },
});
