import type { WaClient, WaIncomingMessageEvent } from "zapo-js";
import { config } from "../config.ts";
import { kv } from "../db/kv.ts";
import { wasSentByBot } from "../bot/client.ts";
import { getMode, isBanned, isOwner, isPrivileged } from "../features/access.ts";
import { handleStatus, runAutomations } from "../features/automation.ts";
import { getStickerCommands, runFilters, stickerHash } from "../features/filters.ts";
import { isAllowedIn } from "../features/allowedCommands.ts";
import { runGames } from "../features/games.ts";
import { countGroupMessage } from "../features/groupStats.ts";
import { cacheMessage } from "../features/messageCache.ts";
import { checkCaptcha } from "../features/groupWatch.ts";
import { writeAudit } from "../features/audit.ts";
import { isFlagOn, isMaintenance } from "../features/flags.ts";
import { getGroupSettings } from "../features/groupSettings.ts";
import { isBotAdmin, isGroupAdmin } from "../features/groups.ts";
import { t } from "../features/i18n.ts";
import { isLogGroup } from "../features/logGroup.ts";
import { increment, recordCommand, recordError } from "../features/metrics.ts";
import { runGroupGuards } from "../features/moderation.ts";
import { runGuardianGuards } from "../features/jsGuardian.ts";
import { tournamentCommand } from "../features/jsTorneosBot.ts";
import { checkPolicies } from "../features/policy.ts";
import { answerWithAi, shouldAnswer } from "../features/ai/index.ts";
import { kieConfigured, shouldAnswerWithKie, answerWithKie } from "../features/ai/kie.ts";
import { isJSLeader, isLeaderIdentityQuestion, leaderIdentityReply } from "../features/ai/leaderIdentity.ts";
import { jsDefenseReply } from "../features/jsDefense.ts";
import { runBrainGuard, brainStage } from "../features/brainGuard.ts";
import { canUseSimpleAdminCommand } from "../features/adminSimpleCommands.ts";
import { recordIncoming } from "../features/ai/history.ts";
import { errorMessage, logger } from "../lib/logger.ts";
import { findCommand, splitCommand, type Command } from "./command.ts";
import { createContext, type Ctx } from "./context.ts";
import { parseMessage } from "./message.ts";

const MAX_COMMAND_AGE_SECONDS = 5 * 60;
const STATUS_CHAT = "status@broadcast";

export async function handleMessage(client: WaClient, event: WaIncomingMessageEvent): Promise<void> {
  if (event.key.fromMe && wasSentByBot(event.key.id)) return;

  const message = parseMessage(event.message);
  if (!message) return;
  increment("messages_in");

  // JS Family: aceptar solo estos dos comandos con / sin cambiar los comandos # de Asena.
  const normalCommand = splitCommand(message.text, config.prefix);
  const slashCommand = normalCommand ? null : splitCommand(message.text, "/");
  const allowedSlashes = ["privados", "reglas", "kick", "warn", "unwarn", "warnings", "ban", "desban", "unban", "permitirlink", "quitarlink", "links", "guardian", "cerebro", "sanciones", "menujs", "promord", "promosrd", "promo", "precios", "torneos", "cargar", "confirmarcarga", "cancelarcarga", "estadocarga", "saldoepinby", "catalogoepin", "adminscomandos", "kie", "caracter", "recordame", "recuerdos", "olvidame"];
  const translated = slashCommand && allowedSlashes.includes(slashCommand.name)
    ? { ...slashCommand, name: ({ ban: "banjs", desban: "desbanjs", unban: "desbanjs", warnings: "warns", links: "linksjs" } as Record<string,string>)[slashCommand.name] ?? slashCommand.name }
    : null;
  // Aceptar .precios sin alterar otros comandos con el prefijo de Asena.
  const dotCommand = normalCommand || translated ? null : splitCommand(message.text, ".");
  const command = normalCommand ?? translated ?? (dotCommand?.name === "precios" || dotCommand?.name === "torneos" ? dotCommand : null);
  const ctx = createContext(client, event, message, command);

  try {
    if (event.key.remoteJid === STATUS_CHAT) {
      await handleStatus(ctx);
      return;
    }
    // Silencio total en chats privados ajenos; no afecta los avisos salientes
    // de inscripción ni los mensajes privados al dueño.
    if (!ctx.isGroup && !isOwner(ctx) && !isJSLeader(ctx) && (await kv.get<boolean>("js_private_replies_disabled")) === true) return;
    recordIncoming(event, message, ctx.sender);
    cacheMessage({ chat: ctx.chat, id: event.key.id, sender: ctx.sender, senderName: ctx.pushName, at: Date.now(), content: message.content });

    if (ctx.isGroup && !ctx.fromMe) {
      countGroupMessage(ctx.chat, ctx.senderIds[0] ?? ctx.sender, ctx.pushName);
      brainStage(ctx.chat,"recibido");
    }
    if (await checkCaptcha(ctx)) {if(ctx.isGroup)brainStage(ctx.chat,"captcha_previo");return;}
    if (await runGuardianGuards(ctx)) {if(ctx.isGroup)brainStage(ctx.chat,"proteccion_previa");return;}
    if (await runGroupGuards(ctx)) {if(ctx.isGroup)brainStage(ctx.chat,"filtro_previo");return;}

    const ageSeconds = Date.now() / 1000 - (event.timestampSeconds ?? Date.now() / 1000);
    if (ageSeconds > MAX_COMMAND_AGE_SECONDS){if(ctx.isGroup)brainStage(ctx.chat,"mensaje_antiguo");return;}
    // Capa opcional de moderación activa para todo el grupo, antes del filtro solo-JS.
    if (await runBrainGuard(ctx)) return;

    if (await tournamentCommand(ctx)) return;

    // Los participantes pueden conversar con la IA, pero nunca ejecutar compras ni comandos privados.
    if (!isJSLeader(ctx)) {
      const definition = command ? findCommand(command.name) : undefined;
      if (definition && await canUseSimpleAdminCommand(ctx,definition.name)) {
        await runCommand(ctx,definition,true);
        return;
      }
      if (command) return;
      if (kieConfigured() && await shouldAnswerWithKie(ctx)) {
        await answerWithKie(ctx);
        return;
      }
      const comeback = jsDefenseReply(ctx);
      if (comeback) await ctx.reply(comeback);
      return;
    }

    if (await runAutomations(ctx, Boolean(command))) return;

    if (command) {
      const definition = findCommand(command.name);
      if (definition) await runCommand(ctx, definition);
      return;
    }

    if (await runGames(ctx)) return;
    if (await runStickerCommand(client, event, ctx)) return;
    if (await runFilters(ctx)) return;
    // Identidad del líder: verificamos el remitente real, no el nombre que escriben.
    // Responde incluso si la API de IA agotó sus créditos.
    if (isJSLeader(ctx) && isLeaderIdentityQuestion(ctx.text)) {
      await ctx.reply(leaderIdentityReply());
      return;
    }
    if (kieConfigured()) {
      if (await shouldAnswerWithKie(ctx)) await answerWithKie(ctx);
    } else if (await shouldAnswer(ctx)) await answerWithAi(ctx);
  } catch (error) {
    await reportCrash(ctx, error);
  }
}

// A sticker bound with #stcmd runs its command as if the sender typed it.
async function runStickerCommand(client: WaClient, event: WaIncomingMessageEvent, ctx: Ctx): Promise<boolean> {
  const hash = ctx.message.type === "sticker" ? stickerHash(ctx.message.content) : null;
  if (!hash) return false;
  const text = (await getStickerCommands())[hash];
  const command = text ? splitCommand(`${config.prefix}${text}`, config.prefix) : null;
  const definition = command ? findCommand(command.name) : undefined;
  if (!command || !definition) return false;

  const stickerCtx = createContext(client, event, { ...ctx.message, text: `${config.prefix}${text}` }, command);
  await runCommand(stickerCtx, definition);
  return true;
}

async function checkRules(ctx: Ctx, cmd: Command, delegatedAdmin = false): Promise<string | null> {
  // Segunda verificación: nunca permitir que una ejecución delegada sortee la lista segura.
  if (delegatedAdmin && !(await canUseSimpleAdminCommand(ctx,cmd.name))) return "";
  const privileged = await isPrivileged(ctx);

  if (!privileged && (await isBanned(ctx))) return "";

  if (!privileged && !delegatedAdmin && (await getMode()) === "private" && !(await isAllowedIn(ctx.chat, cmd.name))) return "";

  if (cmd.permission === "owner" && !isOwner(ctx) && !delegatedAdmin) return t("OWNER_ONLY");
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

export async function runCommand(ctx: Ctx, cmd: Command, delegatedAdmin = false): Promise<void> {
  const problem = await checkRules(ctx, cmd, delegatedAdmin);
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
