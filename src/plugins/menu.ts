import { config } from "../config.ts";
import { command, findCommand, menuCommands, type Category, type Command } from "../core/command.ts";
import type { Ctx } from "../core/context.ts";
import { getMode, isPrivileged } from "../features/access.ts";
import { getLanguage } from "../features/i18n.ts";
import { formatUptime } from "../lib/format.ts";

const SECTIONS: { category: Category; title: string }[] = [
  { category: "misc", title: "GENERAL" },
  { category: "info", title: "INFO" },
  { category: "media", title: "MEDIA" },
  { category: "group", title: "GROUP" },
  { category: "admin", title: "GROUP ADMIN" },
  { category: "owner", title: "OWNER" },
];

async function buildMenu(ctx: Ctx): Promise<string> {
  const p = config.prefix;
  const showOwner = await isPrivileged(ctx);
  const visible = menuCommands().filter((cmd) => showOwner || cmd.category !== "owner");

  const lines = [
    `╭─── *${config.botName.toUpperCase()}* v${config.version}`,
    `│ Hi ${ctx.pushName || "there"}`,
    `│ Prefix *${p}*  ·  Mode *${await getMode()}*  ·  Lang *${getLanguage()}*`,
    `│ ${visible.length} commands  ·  up ${formatUptime(process.uptime())}`,
    `╰───────────────`,
  ];

  for (const section of SECTIONS) {
    const list = visible.filter((cmd) => cmd.category === section.category);
    if (list.length === 0) continue;

    lines.push(``, `┌─ *${section.title}*`);
    for (const cmd of list) lines.push(`│ ${p}${cmd.name} · _${cmd.description}_`);
    lines.push(`└────`);
  }

  lines.push(``, `› \`${p}help <command>\` shows how to use a command.`);
  return lines.join("\n");
}

function describeCommand(cmd: Command): string {
  const p = config.prefix;
  const rules = [
    cmd.permission === "owner" && "owner only",
    cmd.permission === "sudo" && "owner + sudo",
    cmd.groupOnly && "groups only",
    cmd.adminOnly && "group admins",
    cmd.botAdmin && "bot must be admin",
  ].filter(Boolean);

  const lines = [`*${p}${cmd.name}*`, cmd.description, ``, `*Usage:* \`${p}${cmd.name}${cmd.usage ? ` ${cmd.usage}` : ""}\``];
  if (cmd.aliases?.length) lines.push(`*Also:* ${cmd.aliases.map((alias) => `\`${p}${alias}\``).join(", ")}`);
  if (rules.length) lines.push(`*Rules:* ${rules.join(", ")}`);
  return lines.join("\n");
}

command({
  name: "menu",
  aliases: ["list"],
  description: "Show all commands",
  category: "misc",
  run: async (ctx) => {
    await ctx.reply(await buildMenu(ctx));
  },
});

command({
  name: "help",
  description: "How to use one command",
  category: "misc",
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
