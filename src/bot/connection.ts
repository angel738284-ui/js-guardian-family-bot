import qrcode from "qrcode-terminal";
import {
  ConsoleLogger,
  isBroadcastJid,
  isNewsletterJid,
  WaClient,
  type LogLevel,
  type WaClientOptions,
  type WaConnectionEvent,
} from "zapo-js";
import { createMediaProcessor } from "@zapo-js/media-utils";
import { config } from "../config.ts";
import { handleMessage } from "../core/handler.ts";
import { recordOutgoing } from "../features/ai/history.ts";
import { addOwnerIds, ownerNumbers } from "../features/access.ts";
import { ensureLogGroup } from "../features/logGroup.ts";
import { startReminders, stopReminders } from "../features/reminders.ts";
import { announceStartup } from "../features/setup.ts";
import { handleGroupEvent } from "../features/welcome.ts";
import { errorMessage, logger } from "../lib/logger.ts";
import { setClient } from "./client.ts";
import { clearSavedLogin, openSessionStore, SESSION_ID } from "./store.ts";
import { reportSessionEvent } from "./remoteSession.ts";
import { botStatus } from "./status.ts";
import { stopCallHost, voipPlugins, wireCalls } from "./voip.ts";
import { attachCallEvents } from "../features/calls.ts";

const FATAL_REASONS = new Set([
  "stream_error_replaced",
  "failure_banned",
  "failure_locked",
  "failure_bad_user_agent",
]);

const ZAPO_LOG_LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error"];

let client: WaClient | null = null;
let reconnectAttempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let closingOnPurpose = false;
let extraOptions: Partial<WaClientOptions> = {};

function testHooksFromEnv(): Partial<WaClientOptions> {
  const raw = process.env.ASENA_TEST_HOOKS;
  if (!raw) return {};
  const hooks = JSON.parse(raw) as { chatSocketUrls: string[]; noiseRootCa: { publicKey: string; serial: number } };
  return {
    chatSocketUrls: hooks.chatSocketUrls,
    testHooks: { noiseRootCa: { publicKey: Buffer.from(hooks.noiseRootCa.publicKey, "base64"), serial: hooks.noiseRootCa.serial } },
  };
}

export async function startBot(testOptions: Partial<WaClientOptions> = {}): Promise<void> {
  extraOptions = { ...testHooksFromEnv(), ...testOptions };
  client = await createClient();
  await connect();
}

async function createClient(): Promise<WaClient> {
  const store = await openSessionStore();
  const zapoLevel = ZAPO_LOG_LEVELS.find((level) => level === config.zapoLogLevel) ?? "warn";
  const plugins = await voipPlugins();

  const wa = new WaClient(
    {
      store,
      sessionId: SESSION_ID,
      recoverFromClientTooOld: true,
      history: { enabled: false },
      plugins,
      media: {
        processor: createMediaProcessor(),
        generateThumbnail: true,
        generateProbe: true,
        generateWaveform: true,
        normalizeVoiceNote: true,
      },
      ...extraOptions,
    },
    new ConsoleLogger(zapoLevel),
  );

  setClient(wa);
  wireEvents(wa);
  wireCalls(wa);
  attachCallEvents(wa);

  wa.ignoreKey((stanza) => {
    const jid = stanza.remoteJid ?? "";
    return isBroadcastJid(jid) || isNewsletterJid(jid);
  });

  return wa;
}

async function connect(): Promise<void> {
  if (!client) return;
  try {
    await client.connect();
  } catch (error) {
    logger.warn(`Connecting failed: ${errorMessage(error)}`);
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const delay = Math.min(60_000, 2_000 * 2 ** reconnectAttempt) + Math.floor(Math.random() * 500);
  reconnectAttempt += 1;
  logger.info(`Reconnecting in ${Math.round(delay / 1000)}s...`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connect();
  }, delay);
}

function wireEvents(wa: WaClient): void {
  wa.on("auth_qr", ({ qr }) => {
    if (config.pairingNumber) return;
    qrcode.generate(qr, { small: true });
    console.log("\n› Scan this QR code: WhatsApp → Linked devices → Link a device.");
    console.log("   (Or set PAIRING_NUMBER in .env to use a pairing code instead.)\n");
  });

  wa.on("auth_pairing_required", async () => {
    if (!config.pairingNumber) return;
    try {
      const code = await wa.auth.requestPairingCode(config.pairingNumber);
      const pretty = code.match(/.{1,4}/g)?.join("-") ?? code;
      console.log(`\nPairing code: ${pretty}`);
      console.log("   WhatsApp → Linked devices → Link a device → Link with phone number instead.\n");
    } catch (error) {
      logger.error(`Could not get a pairing code: ${errorMessage(error)}`);
    }
  });

  wa.on("auth_paired", ({ credentials }) => {
    console.log(`✓ Paired as ${credentials.meJid ?? "unknown"}`);
  });

  wa.on("connection", (event) => {
    botStatus.connected = event.status === "open";
    if (event.status === "open") {
      reconnectAttempt = 0;
      console.log("✓ Connected to WhatsApp");
      void reportSessionEvent("connected");
      void afterConnected(wa);
    } else {
      void handleDisconnect(event);
    }
  });

  wa.on("message", (event) => {
    handleMessage(wa, event).catch((error) => logger.error("Message handler failed", error));
  });

  wa.on("message_send", (event) => recordOutgoing(event));

  wa.on("group", (event) => {
    handleGroupEvent(event).catch((error) => logger.error("Group event handler failed", error));
  });

  wa.on("stream_failure", (event) => {
    logger.warn(`Stream failure: ${event.failureReason ?? "unknown"} (${event.failureCode ?? "?"})`);
  });
}

async function handleDisconnect(event: Extract<WaConnectionEvent, { status: "close" }>): Promise<void> {
  stopReminders();
  if (closingOnPurpose || event.reason === "client_disconnected") return;

  if (event.isLogout && config.sessionId) {
    await reportSessionEvent("logged_out");
    logger.error("WhatsApp logged this session out (unlinked from the phone).");
    console.log("   Open https://app.asena.fun, choose Refresh session, and put the new SESSION_ID in your settings.");
    console.log("   Not using the dashboard? Pair again at https://asena.fun/pair.\n");
    void import("../terminal.ts").then((terminal) => terminal.shutdown(1, false));
    return;
  }

  if (event.isLogout) {
    console.log("This device was logged out from the phone. Clearing the old login...");
    await clearSavedLogin();
    console.log("   Starting a new login. Scan the next QR code.\n");
    client = await createClient();
    reconnectAttempt = 0;
    await connect();
    return;
  }

  if (event.reason === "stream_error_replaced" && config.sessionId) {
    logger.error("This session was started on another machine. Stopping this copy.");
    await reportSessionEvent("replaced");
    void import("../terminal.ts").then((terminal) => terminal.shutdown(1, false));
    return;
  }

  if (FATAL_REASONS.has(event.reason)) {
    logger.error(`WhatsApp closed the connection for good: ${event.reason} (${event.code ?? "?"}). Not reconnecting.`);
    return;
  }

  logger.warn(`Connection closed: ${event.reason} (${event.code ?? "?"})`);
  void reportSessionEvent("disconnected", event.reason);
  scheduleReconnect();
}

async function afterConnected(wa: WaClient): Promise<void> {
  startReminders();

  const owners = ownerNumbers();
  if (owners.length) {
    try {
      const results = await wa.profile.getLidsByPhoneNumbers(owners);
      addOwnerIds(results.map((result) => result.lidJid).filter((lid): lid is string => Boolean(lid)));
    } catch (error) {
      logger.warn(`Could not look up owner LIDs: ${errorMessage(error)}`);
    }
  }

  const logGroup = await ensureLogGroup();
  if (!logGroup.jid) {
    logger.warn(`No system log group: ${logGroup.error ?? "unknown reason"}`);
    return;
  }
  if (logGroup.created) console.log(`✓ Created system log group ${logGroup.jid}`);
  await announceStartup();
}

export async function stopBot(): Promise<void> {
  closingOnPurpose = true;
  stopCallHost();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  stopReminders();
  await client?.disconnect().catch(() => {});
}

export async function restartBot(): Promise<void> {
  await stopBot();
  closingOnPurpose = false;
  reconnectAttempt = 0;
  await connect();
}

export async function logoutBot(): Promise<void> {
  closingOnPurpose = true;
  stopReminders();
  try {
    await client?.logout();
  } catch (error) {
    logger.warn(`Logout request failed (${errorMessage(error)}). Clearing the local login anyway.`);
  }
  await clearSavedLogin();
}
