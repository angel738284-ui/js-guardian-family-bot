import { config } from "../config.ts";
import { getClient, sendText } from "../bot/client.ts";
import { kv } from "../db/kv.ts";
import { phoneToJid } from "../lib/jid.ts";
import { errorMessage, logger } from "../lib/logger.ts";
import { ownerNumbers } from "./access.ts";
import { setErrorBurstHandler } from "./metrics.ts";

const LOG_GROUP_KEY = "log_group_jid";
const MIN_GAP_MS = 1_500;

let logGroupJid: string | null = null;
let sendChain: Promise<void> = Promise.resolve();
let lastSentAt = 0;

export async function loadLogGroup(): Promise<void> {
  logGroupJid = await kv.get<string>(LOG_GROUP_KEY);
}

export function getLogGroupJid(): string | null {
  return logGroupJid;
}

export function isLogGroup(jid: string): boolean {
  return logGroupJid !== null && jid === logGroupJid;
}

export async function setLogGroupJid(jid: string | null): Promise<void> {
  logGroupJid = jid;
  await kv.set(LOG_GROUP_KEY, jid);
}

export async function isSetupDone(): Promise<boolean> {
  return (await kv.get<boolean>("setup_done")) === true;
}

export async function markSetupDone(done: boolean): Promise<void> {
  await kv.set("setup_done", done);
}

export async function ensureLogGroup(): Promise<{ jid: string | null; created: boolean; error?: string }> {
  const client = getClient();
  if (!client) return { jid: null, created: false, error: "Not connected." };

  if (logGroupJid) {
    try {
      await client.group.queryGroupMetadata(logGroupJid);
      return { jid: logGroupJid, created: false };
    } catch {
      await setLogGroupJid(null);
    }
  }

  const botPhone = (client.getCredentials()?.meJid ?? "").split(/[:@]/)[0];
  const members = ownerNumbers()
    .filter((phone) => phone !== botPhone)
    .map(phoneToJid);

  if (members.length === 0) {
    return {
      jid: null,
      created: false,
      error: "No owner number. Set OWNER_NUMBER, or add the bot to a group and run #setlog there.",
    };
  }

  try {
    const group = await client.group.createGroup(`${config.botName} · System`, members);
    await setLogGroupJid(group.jid);
    await sendText(
      group.jid,
      `*${config.botName} system group*\n\n` +
        `This chat is for *setup* and *internal logs* only.\n` +
        `Other chats never see error details.\n\n` +
        `Next: run \`${config.prefix}setup\` here.`,
    );
    return { jid: group.jid, created: true };
  } catch (error) {
    return { jid: null, created: false, error: errorMessage(error) };
  }
}

export function systemLog(level: "error" | "warn" | "info" | "success", message: string, detail?: unknown): void {
  const text = formatLogLine(level, message, detail);
  if (!logGroupJid || !getClient()) return;

  const target = logGroupJid;
  sendChain = sendChain.then(async () => {
    const wait = MIN_GAP_MS - (Date.now() - lastSentAt);
    if (wait > 0) await Bun.sleep(wait);
    try {
      await sendText(target, text);
      lastSentAt = Date.now();
    } catch (error) {
      console.error("[log-group] send failed:", errorMessage(error));
    }
  });
}

function formatLogLine(level: string, message: string, detail?: unknown): string {
  const icon = { error: "✕", warn: "!", success: "✓" }[level] ?? "›";
  const time = new Date().toISOString().slice(11, 19);
  let text = `${icon} *[${level.toUpperCase()}]* ${time}\n${message}`;

  if (detail !== undefined && detail !== "") {
    const body =
      detail instanceof Error ? (detail.stack ?? detail.message) : typeof detail === "string" ? detail : JSON.stringify(detail);
    text += `\n\`\`\`\n${String(body).slice(0, 1500)}\n\`\`\``;
  }
  return text;
}

export function connectLogGroupToLogger(): void {
  logger.setRemoteSink((level, message, detail) => systemLog(level, message, detail));
  setErrorBurstHandler((count) =>
    systemLog("warn", `Error-rate alert: ${count} errors in the last minute (threshold ${config.errorAlertThreshold}).`),
  );
}
