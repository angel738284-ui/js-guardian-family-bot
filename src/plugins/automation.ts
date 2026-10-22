import { config } from "../config.ts";
import { command } from "../core/command.ts";
import { getAutoSettings, updateAutoSettings, type AutoSettings, type AutoToggle, type ReadMode } from "../features/automation.ts";
import { getBgm, getFilters, getStickerCommands, setBgm, setFilter, setStickerCommand, stickerHash } from "../features/filters.ts";
import { onOff, parseReplyArgs } from "../lib/args.ts";
import { replyScope } from "../lib/ctx.ts";

function toggleCommand(name: AutoToggle, aliases: string[], description: string, note: string) {
  command({
    name,
    aliases,
    description,
    category: "owner",
    usage: "[on|off]",
    permission: "sudo",
    run: async (ctx) => {
      const current = (await getAutoSettings())[name];
      const word = ctx.args.toLowerCase();
      const enabled = word === "on" ? true : word === "off" ? false : !current;
      await updateAutoSettings({ [name]: enabled } as Partial<AutoSettings>);
      await ctx.replyOk(`${description}: ${onOff(enabled)}${enabled && note ? `\n_${note}_` : ""}`);
    },
  });
}

toggleCommand("autoreact", ["reactauto"], "React to incoming messages", "");
toggleCommand("autolike", ["likestatus"], "Like contacts' statuses", "");
toggleCommand("autoview", ["autovv"], "Save view-once media to your own chat", "They arrive in your Message yourself chat.");
toggleCommand("savestatus", ["autostatus"], "Save contacts' statuses to your own chat", "They arrive in your Message yourself chat.");
toggleCommand("anticall", [], "Decline incoming calls", "Callers get a short message asking them to text instead.");

command({
  name: "autoread",
  aliases: ["readauto", "autoblue"],
  description: "Mark messages and statuses as read automatically",
  category: "owner",
  usage: "off | messages | status | all",
  permission: "sudo",
  run: async (ctx) => {
    const modes: ReadMode[] = ["off", "messages", "status", "all"];
    const wanted = ctx.args.toLowerCase() as ReadMode;
    if (!modes.includes(wanted)) {
      await ctx.reply(`*Auto read:* ${(await getAutoSettings()).autoread}\n_Use \`${config.prefix}autoread off | messages | status | all\`._`);
      return;
    }
    await updateAutoSettings({ autoread: wanted });
    await ctx.replyOk(`Auto read: ${wanted}`);
  },
});

command({
  name: "afk",
  aliases: ["away"],
  description: "Reply that you are away until you send a message",
  category: "owner",
  usage: "[reason] | off",
  permission: "sudo",
  run: async (ctx) => {
    if (ctx.args.toLowerCase() === "off") {
      await updateAutoSettings({ afk: null });
      await ctx.replyOk("AFK off.");
      return;
    }
    await updateAutoSettings({ afk: { reason: ctx.args, since: Date.now() } });
    await ctx.replyOk(`AFK on${ctx.args ? `: ${ctx.args}` : ""}.\n_It turns off when you send any message._`);
  },
});

command({
  name: "onmention",
  aliases: ["mentionreply"],
  description: "Auto-reply when someone tags the bot in a group",
  category: "owner",
  usage: "<reply text> | off",
  permission: "sudo",
  run: async (ctx) => {
    if (!ctx.args) {
      const current = (await getAutoSettings()).onMention;
      await ctx.reply(current ? `*Mention reply:*\n${current}` : `*Mention reply:* off\n_Set one with \`${config.prefix}onmention <text>\`._`);
      return;
    }
    const text = ctx.args.toLowerCase() === "off" ? "" : ctx.args;
    await updateAutoSettings({ onMention: text });
    await ctx.replyOk(text ? "Mention reply saved." : "Mention reply off.");
  },
});

command({
  name: "filter",
  aliases: ["filters"],
  description: "Auto-reply when a word is sent",
  category: "tools",
  usage: "add [global] <word> = <reply> | del [global] <word> | list [global]",
  run: async (ctx) => {
    const { action, global, body } = parseReplyArgs(ctx.args);
    const scope = await replyScope(ctx, global);
    if (!scope) {
      await ctx.replyFail(ctx.isGroup && !global ? "Only group admins can manage filters here." : "Only the owner can manage these filters.");
      return;
    }

    switch (action) {
      case "add": {
        const [word, ...reply] = body.split("=");
        if (!word?.trim() || !reply.join("=").trim()) break;
        await setFilter(scope, word.trim(), reply.join("=").trim());
        await ctx.replyOk(`Filter "${word.trim()}" saved${scope === "global" ? " for every chat" : ""}.`);
        return;
      }
      case "del":
      case "remove":
        if (!body.trim()) break;
        await setFilter(scope, body.trim(), null);
        await ctx.replyOk(`Filter "${body.trim()}" removed.`);
        return;
      case "list": {
        const filters = await getFilters(scope);
        const lines = Object.entries(filters).map(([word, reply]) => `• *${word}* → ${reply.slice(0, 60)}`);
        await ctx.reply(lines.length ? `*Filters${scope === "global" ? " (global)" : ""}*\n${lines.join("\n")}` : "*Filters:* _(none)_");
        return;
      }
    }
    await ctx.replyFail(`Usage: \`${config.prefix}filter add hi = Hello there!\``);
  },
});

command({
  name: "bgm",
  description: "Auto-reply with audio when a word is sent",
  category: "tools",
  usage: "add [global] <word> (reply to audio) | del [global] <word> | list [global]",
  run: async (ctx) => {
    const { action, global, body: word } = parseReplyArgs(ctx.args);
    const scope = await replyScope(ctx, global);
    if (!scope) {
      await ctx.replyFail(ctx.isGroup && !global ? "Only group admins can manage audio replies here." : "Only the owner can manage these.");
      return;
    }

    switch (action) {
      case "add": {
        if (!word) break;
        const media = await ctx.downloadMedia();
        if (!media || media.type !== "audio") {
          await ctx.replyFail("Reply to an audio or voice note.");
          return;
        }
        const ptt = Boolean(ctx.message.quoted?.content.audioMessage?.ptt);
        await setBgm(scope, word, { bytes: media.bytes, mimetype: media.mimetype || "audio/ogg; codecs=opus", ptt });
        await ctx.replyOk(`Audio reply for "${word}" saved.`);
        return;
      }
      case "del":
      case "remove":
        if (!word) break;
        await setBgm(scope, word, null);
        await ctx.replyOk(`Audio reply for "${word}" removed.`);
        return;
      case "list": {
        const words = Object.keys(await getBgm(scope));
        await ctx.reply(words.length ? `*Audio replies*\n${words.map((item) => `• ${item}`).join("\n")}` : "*Audio replies:* _(none)_");
        return;
      }
    }
    await ctx.replyFail(`Usage: reply to an audio with \`${config.prefix}bgm add hello\``);
  },
});

command({
  name: "stcmd",
  aliases: ["setcmd"],
  description: "Make a sticker run a command",
  category: "tools",
  usage: "set <command> (reply to a sticker) | del (reply to a sticker) | list",
  permission: "sudo",
  run: async (ctx) => {
    const [action = "list", ...rest] = ctx.args.split(/\s+/);
    const quoted = ctx.message.quoted;
    const hash = quoted?.type === "sticker" ? stickerHash(quoted.content) : null;

    switch (action.toLowerCase()) {
      case "set": {
        const raw = rest.join(" ").trim();
        const text = (raw.startsWith(config.prefix) ? raw.slice(config.prefix.length) : raw).trim();
        if (!hash || !text) break;
        await setStickerCommand(hash, text);
        await ctx.replyOk(`That sticker now runs \`${config.prefix}${text}\`.`);
        return;
      }
      case "del":
        if (!hash) break;
        await setStickerCommand(hash, null);
        await ctx.replyOk("Sticker command removed.");
        return;
      case "list": {
        const commands = Object.values(await getStickerCommands());
        await ctx.reply(commands.length ? `*Sticker commands*\n${commands.map((item) => `• ${config.prefix}${item}`).join("\n")}` : "*Sticker commands:* _(none)_");
        return;
      }
    }
    await ctx.replyFail(`Reply to a sticker with \`${config.prefix}stcmd set menu\`.`);
  },
});
