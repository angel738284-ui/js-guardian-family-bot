import type { WaClient, WaIncomingMessageEvent } from "zapo-js";
import { config } from "../config.ts";
import { wasSentByBot } from "../bot/client.ts";
import { getMode, isOwner, isPrivileged } from "../features/access.ts";
import { writeAudit } from "../features/audit.ts";
import { isFlagOn, isMaintenance } from "../features/flags.ts";
import { getGroupSettings } from "../features/groupSettings.ts";
import { isBotAdmin, isGroupAdmin } from "../features/groups.ts";
import { t } from "../features/i18n.ts";
import { isLogGroup } from "../features/logGroup.ts";
import { increment, recordCommand, recordError } from "../features/metrics.ts";
import { runGroupGuards } from "../features/moderation.ts";
import { checkPolicies } from "../features/policy.ts";
import { answerWithAi, shouldAnswer } from "../features/ai/index.ts";
import { recordIncoming } from "../features/ai/history.ts";
import { errorMessage, logger } from "../lib/logger.ts";
import { findCommand, splitCommand, type Command } from "./command.ts";
import { createContext, type Ctx } from "./context.ts";
import { parseMessage } from "./message.ts";

const MAX_COMMAND_AGE_SECONDS = 5 * 60;

export async function handleMessage(client: WaClient, event: WaIncomingMessageEvent): Promise<void> {
  if (event.key.fromMe && wasSentByBot(event.key.id)) return;

  const message = parseMessage(event.message);
  if (!message) return;
  increment("messages_in");

  const command = splitCommand(message.text, config.prefix);
  const ctx = createContext(client, event, message, command);
  recordIncoming(event, message, ctx.sender);

  try {
    if (await runGroupGuards(ctx)) return;

    const ageSeconds = Date.now() / 1000 - (event.timestampSeconds ?? Date.now() / 1000);
    if (ageSeconds > MAX_COMMAND_AGE_SECONDS) return;

    if (command) {
      const definition = findCommand(command.name);
      if (definition) await runCommand(ctx, definition);
      return;
    }

    if (await shouldAnswer(ctx)) await answerWithAi(ctx);
  } catch (error) {
    await reportCrash(ctx, error);
  }
}

async function checkRules(ctx: Ctx, cmd: Command): Promise<string | null> {
  const privileged = await isPrivileged(ctx);

  if (!privileged && (await getMode()) === "private") return "";

  if (cmd.permission === "owner" && !isOwner(ctx)) return t("OWNER_ONLY");
  if (cmd.permission === "sudo" && !privileged) return t("SUDO_ONLY");

  if (!privileged && (await isMaintenance())) return t("MAINTENANCE");
  if (cmd.flag && !(await isFlagOn(cmd.flag))) return t("FEATURE_DISABLED", { flag: cmd.flag });

  if (!privileged) {
    const blocked = await checkPolicies({
      commandName: cmd.name,
      category: cmd.category,
      userKey: `${ctx.chat}:${ctx.senderIds[0]}`,
    });
    if (blocked) return t(blocked);
  }

  const needsGroup = cmd.groupOnly || cmd.adminOnly || cmd.botAdmin;
  if (needsGroup && !ctx.isGroup) return t("GROUP_ONLY");

  if (ctx.isGroup) {
    const settings = await getGroupSettings(ctx.chat);
    if (!privileged && settings.disabledCommands.includes(cmd.name)) return t("COMMAND_DISABLED");
  }

  if (ctx.isGroup && (cmd.adminOnly || cmd.botAdmin)) {
    const group = await ctx.group();
    if (cmd.adminOnly && !isGroupAdmin(group, ctx.senderIds)) return t("ADMIN_ONLY");
    if (cmd.botAdmin && !isBotAdmin(group)) return t("BOT_ADMIN");
  }

  return null;
}

export async function runCommand(ctx: Ctx, cmd: Command): Promise<void> {
  const problem = await checkRules(ctx, cmd);
  if (problem !== null) {
    if (problem) await ctx.reply(problem);
    return;
  }

  logger.info(`Command ${config.prefix}${cmd.name} by ${ctx.sender} in ${ctx.isGroup ? ctx.chat : "DM"}`);
  recordCommand(cmd.name);
  await ctx.client.presence.sendChatstate(ctx.chat, { state: "composing" }).catch(() => {});
  try {
    await cmd.run(ctx);
  } finally {
    await ctx.client.presence.sendChatstate(ctx.chat, { state: "paused" }).catch(() => {});
  }

  if (cmd.audit) {
    await writeAudit({
      action: `cmd.${cmd.name}`,
      actor: ctx.sender,
      chat: ctx.chat,
      details: { args: ctx.args.slice(0, 120) },
    });
  }
}

async function reportCrash(ctx: Ctx, error: unknown): Promise<void> {
  recordError();
  const where = `${ctx.command ? config.prefix + ctx.command : "message"} in ${ctx.chat}`;
  logger.error(`Crash while handling ${where}`, error);

  const text = isLogGroup(ctx.chat) ? `✕ ${errorMessage(error)}` : t("FAILED");
  await ctx.reply(text).catch(() => {});
}
