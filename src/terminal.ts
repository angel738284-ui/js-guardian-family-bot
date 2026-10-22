import { logoutBot, restartBot, stopBot } from "./bot/connection.ts";
import { finishRemoteSession } from "./bot/remoteSession.ts";
import { clearSavedLogin, closeSessionStore } from "./bot/store.ts";
import { closeDatabase, kv } from "./db/kv.ts";
import { flushHistory } from "./features/ai/history.ts";
import { flushGroupStats } from "./features/groupStats.ts";
import { errorMessage } from "./lib/logger.ts";

let waitingForWipeConfirmation = false;

export async function shutdown(exitCode = 0, uploadSession = true): Promise<never> {
  await stopBot();
  await flushHistory().catch(() => {});
  await flushGroupStats().catch(() => {});
  await closeSessionStore().catch(() => {});
  await closeDatabase().catch(() => {});
  if (uploadSession) await finishRemoteSession().catch(() => {});
  process.exit(exitCode);
}

async function handleKey(input: string): Promise<void> {
  if (waitingForWipeConfirmation) {
    waitingForWipeConfirmation = false;
    if (input !== "Y") {
      console.log("Wipe cancelled.\n");
      return;
    }
    console.log("Wiping all data...");
    await stopBot();
    await clearSavedLogin();
    await kv.clear();
    console.log("✓ All data wiped. Start the bot again to log in.\n");
    await shutdown(0);
  }

  switch (input) {
    case "R":
      console.log("\nRestarting the connection...");
      await restartBot();
      return;
    case "Q":
      console.log("\nLogging out...");
      await logoutBot();
      console.log("✓ Logged out. Start the bot again to link a new device.\n");
      await shutdown(0);
      return;
    case "A":
      waitingForWipeConfirmation = true;
      console.log("\n!  This deletes the WhatsApp login AND all bot settings (notes, warns, groups...).");
      console.log("   Type Y and press Enter to confirm, anything else to cancel.");
      return;
    case "":
      return;
    default:
      console.log(`Unknown shortcut "${input}". Use R (restart), Q (logout) or A (wipe).`);
  }
}

export function startTerminalShortcuts(): void {
  console.log("\nTerminal shortcuts: R = restart · Q = logout · A = wipe all data · Ctrl+C = exit\n");

  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (data) => {
    handleKey(String(data).trim().toUpperCase()).catch((error) =>
      console.error("Shortcut failed:", errorMessage(error)),
    );
  });

  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    void shutdown(0);
  });
  process.on("SIGTERM", () => void shutdown(0));
}
