import * as zapo from "zapo-js";
import { config } from "../config.ts";
import * as bot from "../bot/client.ts";
import { command } from "../core/command.ts";
import type { Ctx } from "../core/context.ts";
import { kv } from "../db/kv.ts";
import { isOwnerNumber } from "../features/access.ts";
import { writeAudit } from "../features/audit.ts";
import { getGroup } from "../features/groups.ts";
import { errorMessage } from "../lib/logger.ts";
import { calls } from "../features/calls.ts";

const MAX_OUTPUT = 3_500;
const transpiler = new Bun.Transpiler({ loader: "ts" });

function evalScope(ctx: Ctx) {
  return {
    ctx,
    client: ctx.client,
    // Voice calls (src/features/calls.ts); voip is the raw client.voip
    calls,
    voip: (ctx.client as unknown as { voip?: unknown }).voip,
    chat: ctx.chat,
    event: ctx.event,
    quoted: ctx.message.quoted,
    reply: (value: unknown) => ctx.reply(typeof value === "string" ? value : Bun.inspect(value)),
    send: bot.send,
    group: (jid: string = ctx.chat) => getGroup(jid),
    kv,
    config,
    zapo,
    proto: zapo.proto,
  };
}

function compile(code: string, names: string[]): (scope: object) => Promise<unknown> {
  const build = (body: string) => {
    const source = `var __run = async function ({ ${names.join(", ")} }) {\n${body}\n};`;
    return new Function(`${transpiler.transformSync(source)}\nreturn __run;`)();
  };
  try {
    return build(`return (${code}\n);`);
  } catch {
    // Several statements: the code must use "return" itself.
    return build(code);
  }
}

function stripCodeFence(text: string): string {
  return text.replace(/^```(?:ts|js|typescript|javascript)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
}

command({
  name: "eval",
  aliases: [">"],
  description: "Run code inside the bot",
  category: "owner",
  usage: "<code>",
  permission: "owner",
  hidden: true,
  run: async (ctx) => {
    // Second, stricter check: an OWNER_NUMBER, not only "typed on the bot's phone".
    if (!config.enableEval || !isOwnerNumber(ctx)) {
      await ctx.replyFail(
        config.enableEval ? "Only an OWNER_NUMBER can use eval." : "Eval is off. Set ENABLE_EVAL=true in .env and restart.",
      );
      return;
    }

    const code = stripCodeFence(ctx.args);
    if (!code) {
      await ctx.replyFail(`Usage: \`${config.prefix}eval <code>\`, e.g. \`${config.prefix}eval chat\``);
      return;
    }

    await writeAudit({ action: "cmd.eval", actor: ctx.sender, chat: ctx.chat, details: { code: code.slice(0, 200) } });

    const scope = evalScope(ctx);
    const started = performance.now();
    let output: string;
    try {
      const result = await compile(code, Object.keys(scope))(scope);
      output = result === undefined ? "undefined" : typeof result === "string" ? result : Bun.inspect(result, { depth: 3 });
    } catch (error) {
      output = `✕ ${error instanceof Error ? `${error.name}: ${error.message}` : errorMessage(error)}`;
    }
    const ms = Math.round(performance.now() - started);

    if (output.length > MAX_OUTPUT) output = `${output.slice(0, MAX_OUTPUT)}\n… (${output.length - MAX_OUTPUT} more characters)`;
    await ctx.reply(`\`\`\`\n${output}\n\`\`\`\n_${ms} ms_`);
  },
});
