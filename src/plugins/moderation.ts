import { config } from "../config.ts";
import { command, findCommand } from "../core/command.ts";
import type { Ctx } from "../core/context.ts";
import {
  addWarn,
  getGroupSettings,
  getWarns,
  resetWarns,
  updateGroupSettings,
  type GroupSettings,
} from "../features/groupSettings.ts";
import { forgetGroup } from "../features/groups.ts";
import { t } from "../features/i18n.ts";
import { mentionTag, normalizeId } from "../lib/jid.ts";

const onOff = (value: boolean) => (value ? "ON" : "OFF");

function nextValue(args: string, current: boolean): boolean {
  const word = args.toLowerCase();
  if (word === "on") return true;
  if (word === "off") return false;
  return !current;
}

async function messageToggle(ctx: Ctx, flag: "welcome" | "goodbye", textField: "welcomeText" | "goodbyeText") {
  const settings = await getGroupSettings(ctx.chat);
  const isToggle = !ctx.args || ["on", "off"].includes(ctx.args.toLowerCase());

  if (isToggle) {
    const enabled = nextValue(ctx.args, settings[flag]);
    await updateGroupSettings(ctx.chat, { [flag]: enabled });
    const key = flag === "welcome" ? (enabled ? "WELCOME_ON" : "WELCOME_OFF") : enabled ? "GOODBYE_ON" : "GOODBYE_OFF";
    await ctx.reply(t(key));
    return;
  }

  await updateGroupSettings(ctx.chat, { [flag]: true, [textField]: ctx.args });
  await ctx.replyOk(`${flag === "welcome" ? "Welcome" : "Goodbye"} text saved and turned on.\nPlaceholders: @user @group @count`);
}

command({
  name: "welcome",
  description: "Welcome messages",
  category: "admin",
  usage: "[on|off|text with @user @group @count]",
  adminOnly: true,
  run: (ctx) => messageToggle(ctx, "welcome", "welcomeText"),
});

command({
  name: "goodbye",
  description: "Goodbye messages",
  category: "admin",
  usage: "[on|off|text with @user @group @count]",
  adminOnly: true,
  run: (ctx) => messageToggle(ctx, "goodbye", "goodbyeText"),
});

command({
  name: "antilink",
  description: "Delete messages with links",
  category: "admin",
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
  category: "admin",
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
  category: "admin",
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

const PRESETS: Record<string, Partial<GroupSettings>> = {
  recommended: { welcome: true, goodbye: true, antilink: true, antispam: true },
  minimal: { welcome: true, goodbye: false, antilink: false, antispam: false },
  off: { welcome: false, goodbye: false, antilink: false, antispam: false },
};

command({
  name: "groupsetup",
  description: "Apply a moderation preset",
  category: "admin",
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

async function requireTarget(ctx: Ctx): Promise<string | null> {
  const target = ctx.target();
  if (!target) await ctx.replyFail(`Mention a user or reply to their message.\nUsage: \`${config.prefix}${ctx.command} @user\``);
  return target;
}

command({
  name: "warn",
  description: "Warn a member",
  category: "admin",
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
  category: "admin",
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
  description: "Delete every message a member sends",
  category: "admin",
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
  category: "admin",
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
  category: "admin",
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

const ALWAYS_ON = new Set(["enable", "disable", "disabled", "menu", "help", "mode", "sudo"]);

command({
  name: "disable",
  description: "Turn a command off in this group",
  category: "admin",
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
  description: "Turn a disabled command back on",
  category: "admin",
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
