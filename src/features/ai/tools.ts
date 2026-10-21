import { botIdentity, send } from "../../bot/client.ts";
import { findCommand } from "../../core/command.ts";
import { createContext, type Ctx } from "../../core/context.ts";
import { runCommand } from "../../core/handler.ts";
import type { ParsedMessage } from "../../core/message.ts";
import { config } from "../../config.ts";
import { normalizeId } from "../../lib/jid.ts";
import { errorMessage, logger } from "../../lib/logger.ts";
import { groupAdmins, participantLabel } from "../groups.ts";
import { findMessage, watchOutgoing } from "./history.ts";
import { handlesIn, prepareMentions, resolveHandles } from "./mentions.ts";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

const MAX_SUMMARY_CHARS = 400;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function summarize(message: ParsedMessage): string {
  const text = message.text.length > MAX_SUMMARY_CHARS ? `${message.text.slice(0, MAX_SUMMARY_CHARS)}…` : message.text;
  return message.type === "text" ? text : `[${message.type}]${text ? ` ${text}` : ""}`;
}

async function runCommandTool(ctx: Ctx, args: Record<string, unknown>): Promise<unknown> {
  const name = asText(args.command).replace(/^[/#.!]+/, "").toLowerCase();
  const definition = findCommand(name);
  if (!definition) return { error: `There is no "${name}" command.` };

  const commandArgs = asText(args.args).replace(/@\+(\d)/g, "@$1");
  let quoted = ctx.message.quoted;
  const targetId = asText(args.target_message_id);
  if (targetId) {
    quoted = await findMessage(ctx.chat, targetId);
    if (!quoted) return { error: "That message could not be found any more." };
  }

  const listed = Array.isArray(args.mentions) ? args.mentions.map(String) : [];
  const mentions = await resolveHandles(ctx, [...listed, ...handlesIn(commandArgs)]);
  const message: ParsedMessage = {
    ...ctx.message,
    text: `${config.prefix}${name}${commandArgs ? ` ${commandArgs}` : ""}`,
    mentions: mentions.length ? mentions : ctx.message.mentions,
    quoted,
  };
  const sub = createContext(ctx.client, ctx.event, message, { name, args: commandArgs });

  const watch = watchOutgoing(ctx.chat);
  try {
    await runCommand(sub, definition);
  } catch (error) {
    logger.warn(`AI-run command ${name} failed: ${errorMessage(error)}`);
    return { error: errorMessage(error), sent_to_chat: watch.stop().map(summarize) };
  }
  const sent = watch.stop().map(summarize);
  return { ran: true, sent_to_chat: sent.length ? sent : ["(nothing)"] };
}

async function replyTool(ctx: Ctx, args: Record<string, unknown>): Promise<unknown> {
  const id = asText(args.message_id);
  const found = await findMessage(ctx.chat, id);
  if (!found) return { error: "That message could not be found any more." };

  const me = botIdentity();
  const fromMe = [me.jid, me.lid].some((jid) => jid && normalizeId(jid) === normalizeId(found.sender));
  const { text, mentions } = await prepareMentions(ctx, asText(args.text));
  if (!text) return { error: "text is empty." };

  await send(ctx.chat, { type: "text", text }, {
    quote: { id, remoteJid: ctx.chat, fromMe, participant: ctx.isGroup ? found.sender : undefined, message: found.content },
    mentions: mentions.length ? mentions : undefined,
  });
  return { sent: true };
}

async function forwardTool(ctx: Ctx, args: Record<string, unknown>): Promise<unknown> {
  const found = await findMessage(ctx.chat, asText(args.message_id));
  if (!found) return { error: "That message could not be found any more." };
  await send(ctx.chat, found.content);
  return { sent: true };
}

async function groupInfoTool(ctx: Ctx): Promise<unknown> {
  if (!ctx.isGroup) return { error: "This is a private chat, not a group." };
  const group = await ctx.group();
  return {
    name: group.subject,
    description: group.desc ?? "",
    only_admins_can_send: Boolean(group.announce),
    only_admins_can_edit_info: Boolean(group.restrict),
    member_count: group.participants.length,
    admins: groupAdmins(group).map(participantLabel),
    members: group.participants.slice(0, 150).map(participantLabel),
  };
}

export async function runTool(ctx: Ctx, call: ToolCall): Promise<unknown> {
  try {
    switch (call.name) {
      case "run_command":
        return await runCommandTool(ctx, call.arguments);
      case "reply_to_message":
        return await replyTool(ctx, call.arguments);
      case "forward_message":
        return await forwardTool(ctx, call.arguments);
      case "get_group_info":
        return await groupInfoTool(ctx);
      case "react":
        await ctx.react(asText(call.arguments.emoji) || "👍");
        return { reacted: true };
      default:
        return { error: `Unknown tool "${call.name}".` };
    }
  } catch (error) {
    return { error: errorMessage(error) };
  }
}
