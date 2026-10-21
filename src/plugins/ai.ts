import { config } from "../config.ts";
import { command } from "../core/command.ts";
import { isPrivileged } from "../features/access.ts";
import { aiEnabledIn, setAiEnabled } from "../features/ai/index.ts";
import { aiConfigured } from "../features/ai/api.ts";
import { isFlagOn } from "../features/flags.ts";
import { isGroupAdmin } from "../features/groups.ts";

command({
  name: "ai",
  description: "Turn natural-language AI replies on or off in this chat",
  category: "tools",
  usage: "on | off",
  run: async (ctx) => {
    const p = config.prefix;
    if (!aiConfigured()) {
      await ctx.replyFail("AI is not set up. Link the bot with a session ID from asena.fun/pair, or set AI_URL and AI_KEY in .env.");
      return;
    }

    const action = ctx.args.toLowerCase();
    if (action !== "on" && action !== "off") {
      const here = (await aiEnabledIn(ctx.chat)) ? "on" : "off";
      const global = (await isFlagOn("ai")) ? "" : ` (turned off for every chat: \`${p}flag ai on\`)`;
      const how = ctx.isGroup ? `Mention me, reply to me or say "${config.ai.name}" to talk to me.` : "Just text me.";
      await ctx.reply(`*AI* is ${here} here${global}.\n${how}\n\n_${p}ai on | off_`);
      return;
    }

    if (ctx.isGroup && !(await isPrivileged(ctx)) && !isGroupAdmin(await ctx.group(), ctx.senderIds)) {
      await ctx.replyFail("Only group admins can change this.");
      return;
    }

    await setAiEnabled(ctx.chat, action === "on");
    await ctx.replyOk(`AI is ${action} in this chat.`);
  },
});
