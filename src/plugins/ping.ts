import { send } from "../bot/client.ts";
import { command } from "../core/command.ts";

command({
  name: "ping",
  description: "Check the bot is alive",
  category: "system",
  run: async (ctx) => {
    const started = performance.now();
    const id = await send(ctx.chat, "Pong", { quote: ctx.event });
    const ms = Math.round(performance.now() - started);
    await send(ctx.chat, `Pong · ${ms} ms`, { editKey: { remoteJid: ctx.chat, id, fromMe: true } });
  },
});
