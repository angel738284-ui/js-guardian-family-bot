import { config } from "../config.ts";
import { command, findCommand, menuCommands } from "../core/command.ts";
import { buildMenu, describeCommand } from "../lib/menu.ts";

command({
  name: "menu",
  aliases: ["list"],
  description: "Show all commands",
  category: "system",
  run: async (ctx) => {
    await ctx.reply(await buildMenu(ctx));
  },
});

command({
  name: "help",
  description: "How to use one command",
  category: "system",
  usage: "<command>",
  run: async (ctx) => {
    const wanted = ctx.args.toLowerCase().replace(config.prefix, "").trim();
    if (!wanted) {
      await ctx.reply(await buildMenu(ctx));
      return;
    }

    const exact = findCommand(wanted);
    if (exact) {
      await ctx.reply(describeCommand(exact));
      return;
    }

    const suggestions = menuCommands()
      .filter((cmd) => cmd.name.includes(wanted))
      .slice(0, 5)
      .map((cmd) => `\`${config.prefix}${cmd.name}\``);
    await ctx.replyFail(
      suggestions.length ? `Unknown command. Did you mean ${suggestions.join(", ")}?` : `Unknown command. Try \`${config.prefix}menu\`.`,
    );
  },
});
