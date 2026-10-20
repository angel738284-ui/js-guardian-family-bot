import type { WaClient, WaIncomingBotChunkEvent, WaIncomingMessageEvent } from "zapo-js";
import { WA_BOT_KNOWN_JIDS } from "zapo-js/protocol";
import { config } from "../config.ts";
import { command } from "../core/command.ts";
import { extractText, unwrap } from "../core/message.ts";
import { normalizeId } from "../lib/jid.ts";

const ANSWER_TIMEOUT_MS = 60_000;

let queue: Promise<unknown> = Promise.resolve();

let cachedBotJid: string | null = null;

async function metaAiJid(client: WaClient): Promise<string> {
  if (cachedBotJid) return cachedBotJid;
  try {
    const bots = await client.bot.listBots();
    cachedBotJid = (bots.find((bot) => bot.isDefault) ?? bots[0])?.jid ?? null;
  } catch {
    // Listing bots can fail on accounts without AI features; try the known ID anyway.
  }
  cachedBotJid ??= WA_BOT_KNOWN_JIDS.META_AI_FBID;
  return cachedBotJid;
}

function isFromMetaAi(sender: string, botJid: string): boolean {
  const ids = [botJid, WA_BOT_KNOWN_JIDS.META_AI_PN, WA_BOT_KNOWN_JIDS.META_AI_FBID].map(normalizeId);
  return sender.endsWith("@bot") || ids.includes(normalizeId(sender));
}

async function askMetaAi(client: WaClient, question: string): Promise<string> {
  const botJid = await metaAiJid(client);

  return new Promise<string>((resolve, reject) => {
    const pieces = new Map<string, string>();

    const finish = (error: Error | null, answer = "") => {
      clearTimeout(timer);
      client.off("message_bot_chunk", onChunk);
      client.off("message", onMessage);
      if (error) reject(error);
      else resolve(answer.trim());
    };

    // Streamed answer: "first" → "inner"... → "last", or one "full" piece.
    const onChunk = (event: WaIncomingBotChunkEvent) => {
      if (!isFromMetaAi(event.key.participant ?? event.key.remoteJid, botJid)) return;
      const text = extractText(unwrap(event.message));
      const sofar = event.editType === "full" ? text : (pieces.get(event.targetMessageId) ?? "") + text;
      pieces.set(event.targetMessageId, sofar);
      if (event.editType === "last" || event.editType === "full") finish(null, sofar);
    };

    // Short answers sometimes arrive as one normal message instead.
    const onMessage = (event: WaIncomingMessageEvent) => {
      if (event.key.fromMe || !event.message || !isFromMetaAi(event.key.remoteJid, botJid)) return;
      const text = extractText(unwrap(event.message));
      if (text) finish(null, text);
    };

    const timer = setTimeout(
      () => finish(new Error("Meta AI did not answer. It may not be available for this account or country.")),
      ANSWER_TIMEOUT_MS,
    );

    client.on("message_bot_chunk", onChunk);
    client.on("message", onMessage);
    client.bot.sendPrompt(botJid, question).catch((error: unknown) => finish(error instanceof Error ? error : new Error(String(error))));
  });
}

command({
  name: "ai",
  aliases: ["meta"],
  description: "Ask Meta AI a question",
  category: "misc",
  usage: "<question>",
  run: async (ctx) => {
    const question = ctx.args || ctx.message.quoted?.text || "";
    if (!question) {
      await ctx.replyFail(`Usage: \`${config.prefix}ai <question>\` or reply to a message with \`${config.prefix}ai\``);
      return;
    }

    await ctx.withTyping(async () => {
      const turn = queue.then(() => askMetaAi(ctx.client, question));
      queue = turn.catch(() => {});
      try {
        const answer = await turn;
        await ctx.reply(answer || "Meta AI sent an empty answer.");
      } catch (error) {
        await ctx.replyFail(error instanceof Error ? error.message : "Meta AI failed.");
      }
    });
  },
});
