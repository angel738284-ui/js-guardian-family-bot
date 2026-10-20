import { config } from "../config.ts";
import { allCommands, command } from "../core/command.ts";
import { addSudo, getMode, isOwner, isPrivileged, listSudo, removeSudo, setMode } from "../features/access.ts";
import { getLanguage, LANGUAGES, setLanguage, t } from "../features/i18n.ts";

command({
  name: "mode",
  description: "Public or private bot",
  category: "owner",
  usage: "[public|private]",
  permission: "sudo",
  audit: true,
  run: async (ctx) => {
    const wanted = ctx.args.toLowerCase();

    if (!wanted) {
      await ctx.reply(
        `*Bot mode:* ${await getMode()}\n\n` +
          `• \`${config.prefix}mode public\` – anyone can use commands\n` +
          `• \`${config.prefix}mode private\` – only owner + sudo`,
      );
      return;
    }

    if (wanted !== "public" && wanted !== "private") {
      await ctx.replyFail(`Use \`${config.prefix}mode public\` or \`${config.prefix}mode private\``);
      return;
    }

    await setMode(wanted);
    await ctx.replyOk(`Mode set to *${wanted}*`);
  },
});

command({
  name: "sudo",
  description: "Manage trusted users",
  category: "owner",
  usage: "[list | add <number|@user> | del <number|@user>]",
  permission: "sudo",
  audit: true,
  run: async (ctx) => {
    const [action = "list", ...rest] = ctx.args.split(/\s+/).filter(Boolean);
    const verb = action.toLowerCase();

    if (verb === "list") {
      const list = await listSudo();
      await ctx.reply(list.length ? `*Sudo users:*\n${list.map((id, i) => `${i + 1}. ${id}`).join("\n")}` : "*Sudo users:* _(none)_");
      return;
    }

    if (!isOwner(ctx)) {
      await ctx.replyFail("Only the bot owner can add or remove sudo users.");
      return;
    }

    const target = rest.join(" ") || ctx.target();
    if (!target) {
      await ctx.replyFail(`Usage: \`${config.prefix}sudo add <number|@user>\``);
      return;
    }

    if (verb === "add") {
      await ctx.replyOk(`Added sudo user *${await addSudo(target)}*`);
    } else if (verb === "del" || verb === "remove" || verb === "rm") {
      await ctx.replyOk(`Removed sudo user *${await removeSudo(target)}*`);
    } else {
      await ctx.replyFail("Unknown action. Use `list`, `add` or `del`.");
    }
  },
});

command({
  name: "lang",
  description: "Show or change the bot language",
  category: "system",
  usage: `[${LANGUAGES.join("|")}]`,
  run: async (ctx) => {
    if (!ctx.args) {
      await ctx.reply(t("LANG_LIST", { list: LANGUAGES.join(", "), lang: getLanguage() }));
      return;
    }

    if (!(await isPrivileged(ctx))) {
      await ctx.replyFail(t("SUDO_ONLY"));
      return;
    }

    try {
      await ctx.replyOk(t("LANG_SET", { lang: await setLanguage(ctx.args) }));
    } catch {
      await ctx.replyFail(`Supported languages: ${LANGUAGES.join(", ")}`);
    }
  },
});

command({
  name: "cmdlist",
  description: "Every command name",
  category: "owner",
  permission: "sudo",
  hidden: true,
  run: async (ctx) => {
    const names = allCommands()
      .flatMap((cmd) => [cmd.name, ...(cmd.aliases ?? [])])
      .sort();
    await ctx.reply(`*Commands (${names.length}):*\n${names.join(", ")}`);
  },
});
