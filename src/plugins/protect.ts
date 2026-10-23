import { config } from "../config.ts";
import { command, findCommand } from "../core/command.ts";
import { getAllowed, setAllowed } from "../features/allowedCommands.ts";
import { getAutoSettings, updateAutoSettings, type RecoverMode } from "../features/automation.ts";
import { getGroupSettings, updateGroupSettings } from "../features/groupSettings.ts";

const MODES: RecoverMode[] = ["off", "chat", "owner"];

command({
  name: "antidelete",
  description: "Show deleted messages again",
  category: "owner",
  usage: "off | chat | owner",
  permission: "sudo",
  run: async (ctx) => {
    const mode = ctx.args.toLowerCase() as RecoverMode;
    if (!MODES.includes(mode)) {
      await ctx.reply(`*Anti-delete:* ${(await getAutoSettings()).antidelete}\n• chat – repost in the same chat\n• owner – send to your own chat\n• off`);
      return;
    }
    await updateAutoSettings({ antidelete: mode });
    await ctx.replyOk(`Anti-delete: ${mode}`);
  },
});

command({
  name: "antiedit",
  description: "Show what edited messages said before",
  category: "owner",
  usage: "off | chat | owner",
  permission: "sudo",
  run: async (ctx) => {
    const mode = ctx.args.toLowerCase() as RecoverMode;
    if (!MODES.includes(mode)) {
      await ctx.reply(`*Anti-edit:* ${(await getAutoSettings()).antiedit}\n• chat – show it in the same chat\n• owner – send to your own chat\n• off`);
      return;
    }
    await updateAutoSettings({ antiedit: mode });
    await ctx.replyOk(`Anti-edit: ${mode}`);
  },
});

command({
  name: "antifake",
  description: "Remove new members whose number is not from allowed countries",
  category: "group",
  usage: "<country codes, e.g. 234 233> | off",
  adminOnly: true,
  botAdmin: true,
  run: async (ctx) => {
    if (ctx.args.toLowerCase() === "off") {
      await updateGroupSettings(ctx.chat, { allowedCountries: [] });
      await ctx.replyOk("Antifake off.");
      return;
    }
    const codes = ctx.args.split(/[\s,]+/).map((code) => code.replace(/\D/g, "")).filter((code) => code.length >= 1 && code.length <= 4);
    if (codes.length === 0) {
      const current = (await getGroupSettings(ctx.chat)).allowedCountries;
      await ctx.reply(current.length ? `*Antifake:* only +${current.join(", +")} may join.` : `*Antifake:* off\n_Use \`${config.prefix}antifake 234\` to allow only Nigerian numbers._`);
      return;
    }
    await updateGroupSettings(ctx.chat, { allowedCountries: codes });
    await ctx.replyOk(`Only numbers starting with +${codes.join(", +")} may join now.`);
  },
});

command({
  name: "greet",
  aliases: ["setgreet"],
  description: "Greet people the first time they message the bot",
  category: "owner",
  usage: "<message, @name for their name> | off",
  permission: "sudo",
  run: async (ctx) => {
    if (!ctx.args) {
      const current = (await getAutoSettings()).greet;
      await ctx.reply(current ? `*Greeting:*\n${current}` : `*Greeting:* off\n_Set one with \`${config.prefix}greet Hi @name, I'll reply soon!\`._`);
      return;
    }
    const text = ctx.args.toLowerCase() === "off" ? "" : ctx.args;
    await updateAutoSettings({ greet: text });
    await ctx.replyOk(text ? "Greeting saved." : "Greeting off.");
  },
});

command({
  name: "allowcmd",
  description: "Let everyone in this chat use a command while the bot is private",
  category: "owner",
  usage: "add <command> | del <command> | list",
  permission: "sudo",
  run: async (ctx) => {
    const [action = "list", name = ""] = ctx.args.toLowerCase().split(/\s+/);
    const allowed = await getAllowed(ctx.chat);
    const definition = name ? findCommand(name.replace(config.prefix, "")) : undefined;

    if (action === "add" && definition) {
      await setAllowed(ctx.chat, [...allowed, definition.name]);
      await ctx.replyOk(`Everyone here can use \`${config.prefix}${definition.name}\` now.`);
      return;
    }
    if (action === "del" && definition) {
      await setAllowed(ctx.chat, allowed.filter((item) => item !== definition.name));
      await ctx.replyOk(`\`${config.prefix}${definition.name}\` is owner-only here again.`);
      return;
    }
    if (action === "list") {
      await ctx.reply(allowed.length ? `*Allowed here:* ${allowed.map((item) => config.prefix + item).join(", ")}` : "*Allowed here:* _(none)_");
      return;
    }
    await ctx.replyFail(`Usage: \`${config.prefix}allowcmd add sticker\``);
  },
});
