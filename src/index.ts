import { prepareBot } from "./app.ts";
import { config } from "./config.ts";
import { startBot } from "./bot/connection.ts";
import { prepareRemoteSession, startRemoteSync } from "./bot/remoteSession.ts";
import { hasSavedLogin } from "./bot/store.ts";
import { allCommands } from "./core/command.ts";
import { startAdminHttp } from "./features/adminHttp.ts";
import { startKeepAlive } from "./features/keepAlive.ts";
import { errorMessage, logger } from "./lib/logger.ts";
import { shutdown, startTerminalShortcuts } from "./terminal.ts";

async function main(): Promise<void> {
  console.log(`\n  ${config.botName} v${config.version} · zapo · Bun ${Bun.version}\n`);
  // Listen first, so the host's health check passes while the session downloads.
  startKeepAlive();

  if (config.sessionId) {
    await prepareRemoteSession();
    console.log("✓ Session loaded from the Asena server");
    startRemoteSync((reason) => {
      logger.error(`Stopping: ${reason}`);
      void shutdown(1, false);
    });
  }

  await prepareBot();
  console.log(`✓ Database ready (${config.database.usePostgres ? "Postgres" : config.database.dataDir})`);
  console.log(`✓ ${allCommands().length} commands loaded`);

  if (config.owners.length === 0) {
    console.log("!  OWNER_NUMBER is not set. Owner commands only work from the bot's own phone.");
  }

  if (!config.sessionId && (await hasSavedLogin())) {
    console.log("✓ Saved WhatsApp login found");
  } else if (!config.sessionId) {
    console.log(
      config.pairingNumber
        ? `› No login yet. A pairing code for ${config.pairingNumber} will be shown.`
        : "› No login yet. A QR code will be shown.",
    );
  }

  startAdminHttp();
  startTerminalShortcuts();

  console.log("Connecting to WhatsApp...\n");
  await startBot();
}

main().catch((error) => {
  console.error("✕ Startup failed:", errorMessage(error));
  process.exit(1);
});
