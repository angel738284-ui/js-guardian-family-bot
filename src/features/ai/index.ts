import sharp from "sharp";
import { botIdentity, send } from "../../bot/client.ts";
import { allCommands, type Command } from "../../core/command.ts";
import type { Ctx } from "../../core/context.ts";
import { config } from "../../config.ts";
import { kv } from "../../db/kv.ts";
import { TtlCache } from "../../lib/cache.ts";
import { normalizeId } from "../../lib/jid.ts";
import { errorMessage, logger } from "../../lib/logger.ts";
import { getMode, isOwner, isPrivileged, isSudo } from "../access.ts";
import { isFlagOn } from "../flags.ts";
import { isGroupAdmin } from "../groups.ts";
import { AiServerError, aiConfigured, utilsRequest } from "./api.ts";
import { flushHistory } from "./history.ts";
import { prepareMentions } from "./mentions.ts";
import { runTool, type ToolCall } from "./tools.ts";

type TurnResponse =
  | { status: "done"; replies: string[] }
  | { status: "tool_calls"; turnId: string; replies: string[]; calls: ToolCall[] };

const MAX_STEPS = 10;
const MAX_TURNS_PER_MINUTE = 8;
const IMAGE_EDGE = 1024;
const HIDDEN_FROM_AI = new Set(["eval"]);

const turnsBySender = new TtlCache<number>(60_000, 1_000);
const disabledKey = (chat: string) => `ai_off:${chat}`;

export async function aiEnabledIn(chat: string): Promise<boolean> {
  return (await kv.get<boolean>(disabledKey(chat))) !== true;
}

export async function setAiEnabled(chat: string, enabled: boolean): Promise<void> {
  await kv.set(disabledKey(chat), enabled ? null : true);
}

function addressesBot(ctx: Ctx): boolean {
  const me = botIdentity();
  const myIds = new Set([me.jid, me.lid].filter((id): id is string => Boolean(id)).map(normalizeId));

  if (ctx.message.mentions.some((id) => myIds.has(normalizeId(id)))) return true;
  if (ctx.message.quoted && myIds.has(normalizeId(ctx.message.quoted.sender))) return true;

  const name = config.ai.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${name}(\\W|$)`, "i").test(ctx.text);
}

/** True when this message is meant for the AI: any text in a private chat, or a mention, reply or the bot's name in a group. */
export async function shouldAnswer(ctx: Ctx): Promise<boolean> {
  if (!aiConfigured() || !ctx.text.trim()) return false;

  if (ctx.fromMe) {
    const me = botIdentity();
    if (![me.jid, me.lid].some((id) => id && normalizeId(id) === normalizeId(ctx.chat))) return false;
  }

  if (ctx.isGroup && !addressesBot(ctx)) return false;
  if (!(await isFlagOn("ai")) || !(await aiEnabledIn(ctx.chat))) return false;
  if ((await getMode()) === "private" && !(await isPrivileged(ctx))) return false;

  const key = `${ctx.chat}|${ctx.sender}`;
  const used = turnsBySender.get(key) ?? 0;
  if (used >= MAX_TURNS_PER_MINUTE) return false;
  turnsBySender.set(key, used + 1);
  return true;
}

async function senderRole(ctx: Ctx): Promise<"owner" | "sudo" | "admin" | "member"> {
  if (isOwner(ctx)) return "owner";
  if (await isSudo(ctx)) return "sudo";
  if (!ctx.isGroup) return "member";
  const group = await ctx.group().catch(() => null);
  if (group && isGroupAdmin(group, ctx.senderIds)) return "admin";
  return "member";
}

function commandRules(cmd: Command): string[] {
  return [
    cmd.permission === "owner" && "owner only",
    cmd.permission === "sudo" && "owner + sudo",
    cmd.groupOnly && "groups only",
    cmd.adminOnly && "group admins only",
    cmd.botAdmin && "bot must be admin",
  ].filter((rule): rule is string => Boolean(rule));
}

function visibleCommands(privileged: boolean) {
  return allCommands()
    .filter((cmd) => !cmd.hidden && !HIDDEN_FROM_AI.has(cmd.name))
    .filter((cmd) => privileged || (cmd.permission ?? "everyone") === "everyone")
    .map((cmd) => ({
      name: cmd.name,
      aliases: cmd.aliases,
      description: cmd.description,
      usage: cmd.usage,
      category: cmd.category,
      rules: commandRules(cmd),
    }));
}

async function imageFor(ctx: Ctx): Promise<{ mimetype: string; data: string }[]> {
  const types = ["image", "sticker"];
  if (!types.includes(ctx.message.type) && !types.includes(ctx.message.quoted?.type ?? "")) return [];
  try {
    const media = await ctx.downloadMedia();
    if (!media || !types.includes(media.type)) return [];
    const jpeg = await sharp(media.bytes)
      .resize(IMAGE_EDGE, IMAGE_EDGE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return [{ mimetype: "image/jpeg", data: jpeg.toString("base64") }];
  } catch (error) {
    logger.debug(`Could not read the image for the AI: ${errorMessage(error)}`);
    return [];
  }
}

async function buildRequest(ctx: Ctx) {
  const role = await senderRole(ctx);
  const group = ctx.isGroup ? await ctx.group().catch(() => null) : null;

  return {
    bot: { name: config.ai.name, prefix: config.prefix, phone: botIdentity().phone },
    chat: { id: ctx.chat, isGroup: ctx.isGroup, name: group?.subject, members: group?.participants.length },
    sender: { id: ctx.sender, name: ctx.pushName, role },
    message: {
      id: ctx.event.key.id,
      text: ctx.text,
      type: ctx.message.type,
      quotedId: ctx.message.quoted?.id || undefined,
      quotedText: ctx.message.quoted?.text || undefined,
      quotedSender: ctx.message.quoted?.sender || undefined,
    },
    images: await imageFor(ctx),
    commands: visibleCommands(role === "owner" || role === "sudo"),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendReplies(ctx: Ctx, replies: string[], state: { sent: number }): Promise<void> {
  for (const reply of replies) {
    if (state.sent > 0) {
      await ctx.client.presence.sendChatstate(ctx.chat, { state: "composing" }).catch(() => {});
      await pause(Math.min(400 + reply.length * 20, 2_500));
    }
    const { text, mentions } = await prepareMentions(ctx, reply);
    if (state.sent === 0) await ctx.reply(text, { mentions });
    else await send(ctx.chat, { type: "text", text }, mentions.length ? { mentions } : undefined);
    state.sent++;
  }
}

/** Runs one AI turn: asks the AI server, sends its messages and runs the tools it asks for until it is done. */
export async function answerWithAi(ctx: Ctx): Promise<void> {
  await flushHistory();

  await ctx.withTyping(async () => {
    const state = { sent: 0 };
    try {
      let response = await utilsRequest<TurnResponse>("POST", "/v1/ai/turn", await buildRequest(ctx));

      for (let step = 0; step < MAX_STEPS; step++) {
        await sendReplies(ctx, response.replies, state);
        if (response.status === "done") return;

        const results = [];
        for (const call of response.calls) {
          results.push({ id: call.id, output: await runTool(ctx, call) });
        }
        await flushHistory();
        response = await utilsRequest<TurnResponse>("POST", `/v1/ai/turn/${response.turnId}`, { results });
      }
    } catch (error) {
      logger.warn(`AI turn failed: ${errorMessage(error)}`);
      if (state.sent > 0) return;
      const text =
        error instanceof AiServerError && error.code === "daily_limit"
          ? "_I've used up my AI time for today. Commands still work, and I'm back tomorrow._"
          : "_My brain is offline for a moment, try again in a bit._";
      await ctx.reply(text).catch(() => {});
    }
  });
}
