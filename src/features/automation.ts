import type { Proto, WaIncomingCallEvent } from "zapo-js";
import { botIdentity, getClient, send, sendText } from "../bot/client.ts";
import type { Ctx } from "../core/context.ts";
import { kv } from "../db/kv.ts";
import { formatDuration } from "../lib/format.ts";
import { normalizeId } from "../lib/jid.ts";
import { errorMessage, logger } from "../lib/logger.ts";

export type AutoToggle = "autoreact" | "autolike" | "autoview" | "savestatus" | "anticall";

export type ReadMode = "off" | "messages" | "status" | "all";

export interface AutoSettings {
  autoread: ReadMode;
  autoreact: boolean;
  autolike: boolean;
  autoview: boolean;
  savestatus: boolean;
  anticall: boolean;
  autobio: boolean;
  afk: { reason: string; since: number } | null;
  onMention: string;
}

const DEFAULTS: AutoSettings = {
  autoread: "off",
  autoreact: false,
  autolike: false,
  autoview: false,
  savestatus: false,
  anticall: false,
  autobio: false,
  afk: null,
  onMention: "",
};

const REACTIONS = ["❤️", "😂", "🔥", "👍", "😍", "🙌", "💯", "😮", "👀", "✨"];
const LIKE_EMOJI = "💚";
const AFK_REPLY_GAP_MS = 10 * 60_000;
const STATUS_CHAT = "status@broadcast";

let cache: AutoSettings | null = null;
const lastAfkReply = new Map<string, number>();
const lastMentionReply = new Map<string, number>();

export async function getAutoSettings(): Promise<AutoSettings> {
  cache ??= { ...DEFAULTS, ...((await kv.get<Partial<AutoSettings>>("auto_settings")) ?? {}) };
  return { ...cache };
}

export async function updateAutoSettings(changes: Partial<AutoSettings>): Promise<AutoSettings> {
  const next = { ...(await getAutoSettings()), ...changes };
  cache = next;
  await kv.set("auto_settings", next);
  return next;
}

export function selfChat(): string | null {
  const jid = botIdentity().jid;
  return jid ? jid.replace(/:\d+@/, "@") : null;
}

function isViewOnce(raw: Proto.IMessage | null | undefined): boolean {
  if (!raw) return false;
  if (raw.viewOnceMessage || raw.viewOnceMessageV2 || raw.viewOnceMessageV2Extension) return true;
  return Boolean(raw.imageMessage?.viewOnce || raw.videoMessage?.viewOnce || raw.audioMessage?.viewOnce);
}

// Sends a media message again without the view-once flag.
export async function reopenViewOnce(to: string, content: Proto.IMessage, caption: string): Promise<boolean> {
  const client = getClient();
  if (!client) return false;
  const image = content.imageMessage;
  const video = content.videoMessage;
  const audio = content.audioMessage;
  if (!image && !video && !audio) return false;

  const bytes = await client.message.downloadBytes(content);
  if (image) await send(to, { type: "image", media: bytes, mimetype: image.mimetype ?? "image/jpeg", caption });
  else if (video) await send(to, { type: "video", media: bytes, mimetype: video.mimetype ?? "video/mp4", caption });
  else await send(to, { type: "audio", media: bytes, mimetype: audio!.mimetype ?? "audio/ogg; codecs=opus", ptt: Boolean(audio!.ptt) });
  return true;
}

async function markRead(ctx: Ctx): Promise<void> {
  await ctx.client.message.sendReceipt(ctx.event, { type: "read" }).catch(() => {});
}

// Status updates from contacts: read, like and save them as configured.
export async function handleStatus(ctx: Ctx): Promise<void> {
  if (ctx.fromMe) return;
  const settings = await getAutoSettings();

  if (settings.autoread === "status" || settings.autoread === "all") await markRead(ctx);

  if (settings.autolike) {
    await ctx.client.status
      .send({ content: { type: "reaction", emoji: LIKE_EMOJI, target: ctx.event }, recipients: [ctx.sender] })
      .catch((error) => logger.debug(`Status like failed: ${errorMessage(error)}`));
  }

  const me = selfChat();
  if (settings.savestatus && me && ctx.sender) {
    const caption = `*Status from ${ctx.pushName || ctx.sender.split("@")[0]}*${ctx.text ? `\n${ctx.text}` : ""}`;
    const saved = await reopenViewOnce(me, ctx.message.content, caption).catch(() => false);
    if (!saved && ctx.text) await sendText(me, caption).catch(() => {});
  }
}

function isOwnMention(ctx: Ctx): boolean {
  const me = [botIdentity().jid, botIdentity().lid].filter(Boolean).map(normalizeId);
  const mentioned = ctx.message.mentions.some((id) => me.includes(normalizeId(id)));
  const repliedToMe = ctx.message.quoted ? me.includes(normalizeId(ctx.message.quoted.sender)) : false;
  return mentioned || repliedToMe;
}

function due(map: Map<string, number>, key: string): boolean {
  const last = map.get(key) ?? 0;
  if (Date.now() - last < AFK_REPLY_GAP_MS) return false;
  map.set(key, Date.now());
  return true;
}

// Side effects on every normal message. Returns true when the message was answered here.
export async function runAutomations(ctx: Ctx, isCommand: boolean): Promise<boolean> {
  const settings = await getAutoSettings();

  if (ctx.fromMe) {
    if (settings.afk && !isCommand && ctx.text) {
      await updateAutoSettings({ afk: null });
      await ctx.reply(`_Welcome back. You were away for ${formatDuration(Math.floor((Date.now() - settings.afk.since) / 1000))}._`).catch(() => {});
    }
    return false;
  }

  if (settings.autoread === "messages" || settings.autoread === "all") await markRead(ctx);
  if (settings.autoreact && !isCommand) {
    await ctx.react(REACTIONS[Math.floor(Math.random() * REACTIONS.length)]!);
  }

  const me = selfChat();
  if (settings.autoview && me && isViewOnce(ctx.event.message)) {
    const from = ctx.pushName || ctx.sender.split("@")[0];
    await reopenViewOnce(me, ctx.message.content, `*View once from ${from}*`).catch((error) =>
      logger.debug(`Could not save a view-once message: ${errorMessage(error)}`),
    );
  }

  if (isCommand) return false;
  const addressed = !ctx.isGroup || isOwnMention(ctx);

  if (settings.afk && addressed && due(lastAfkReply, ctx.chat)) {
    const away = formatDuration(Math.floor((Date.now() - settings.afk.since) / 1000));
    await ctx.reply(`_I'm away right now (${away})${settings.afk.reason ? `: ${settings.afk.reason}` : ""}. I'll reply when I'm back._`);
    return true;
  }

  if (settings.onMention && ctx.isGroup && isOwnMention(ctx) && due(lastMentionReply, ctx.chat)) {
    await ctx.reply(settings.onMention);
    return true;
  }

  return false;
}

// Declines incoming calls when anticall is on.
export async function handleCall(event: WaIncomingCallEvent): Promise<void> {
  if (event.type !== "offer" || !event.callId || !event.callCreatorJid) return;
  if (!(await getAutoSettings()).anticall) return;

  const client = getClient();
  if (!client) return;
  const caller = event.callerPnJid ?? event.callCreatorJid;

  try {
    await client.lowlevel.sendNode({
      tag: "call",
      attrs: { to: event.callCreatorJid.replace(/:\d+@/, "@"), id: crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase() },
      content: [{ tag: "reject", attrs: { "call-id": event.callId, "call-creator": event.callCreatorJid, count: "0" } }],
    });
    if (!event.groupJid) await sendText(caller.replace(/:\d+@/, "@"), "_Calls are turned off for this account. Please send a message instead._");
  } catch (error) {
    logger.warn(`Could not decline a call: ${errorMessage(error)}`);
  }
}
