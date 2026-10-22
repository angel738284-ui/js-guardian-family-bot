import { config } from "../config.ts";
import * as bot from "../bot/client.ts";
import { command } from "../core/command.ts";
import { isOwnerNumber } from "../features/access.ts";
import { writeAudit } from "../features/audit.ts";
import { errorMessage } from "../lib/logger.ts";
import { compile, evalScope, stripCodeFence } from "../lib/eval.ts";
import { MAX_COMMAND_OUTPUT } from "../lib/constants.ts";

command({
  name: "eval",
  aliases: [">"],
  description: "Run code inside the bot",
  category: "owner",
  usage: "<code>",
  permission: "owner",
  hidden: true,
  run: async (ctx) => {
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

    if (output.length > MAX_COMMAND_OUTPUT) output = `${output.slice(0, MAX_COMMAND_OUTPUT)}\n… (${output.length - MAX_COMMAND_OUTPUT} more characters)`;
    await ctx.reply(`\`\`\`\n${output}\n\`\`\`\n_${ms} ms_`);
  },
});
