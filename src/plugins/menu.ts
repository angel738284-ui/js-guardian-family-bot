import { config } from "../config.ts";
import { command, findCommand, menuCommands, type Category, type Command } from "../core/command.ts";
import type { Ctx } from "../core/context.ts";
import { getMode, isPrivileged } from "../features/access.ts";
import { formatUptime } from "../lib/format.ts";

const SECTIONS: { category: Category; title: string }[] = [
  { category: "system", title: "System" },
  { category: "group", title: "Group" },
  { category: "media", title: "Media" },
  { category: "tools", title: "Tools" },
  { category: "owner", title: "Owner" },
];

async function buildMenu(ctx: Ctx): Promise<string> {
  const p = config.prefix;
  const showOwner = await isPrivileged(ctx);
  const visible = menuCommands().filter((cmd) => showOwner || cmd.category !== "owner");

  const lines = [
    `*${config.botName}* v${config.version}`,
    `Hi ${ctx.pushName || "there"} · prefix ${p} · ${await getMode()} mode · up ${formatUptime(process.uptime())}`,
  ];

  for (const section of SECTIONS) {
    const names = visible.filter((cmd) => cmd.category === section.category).map((cmd) => cmd.name);
    if (names.length === 0) continue;
    lines.push("", `*${section.title}*`, ...names.map((name) => `  • ${name}`));
  }

  lines.push("", `_${p}help <command> shows how to use one._`);
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
