import { Glob } from "bun";
import path from "node:path";
import { allCommands } from "./core/command.ts";
import { importOldSettings } from "./db/importOld.ts";
import { openDatabase } from "./db/kv.ts";
import { loadSavedOwner } from "./features/access.ts";
import { loadLanguage } from "./features/i18n.ts";
import { connectLogGroupToLogger, loadLogGroup } from "./features/logGroup.ts";

async function loadPlugins(): Promise<void> {
  const folder = path.join(import.meta.dir, "plugins");
  const files = [...new Glob("*.ts").scanSync(folder)].sort();
  for (const file of files) {
    await import(path.join(folder, file));
  }
}

let prepared = false;

export async function prepareBot(): Promise<void> {
  if (prepared) return;
  prepared = true;

  await openDatabase();
  await importOldSettings();
  await loadLanguage();
  await loadSavedOwner();
  await loadLogGroup();
  connectLogGroupToLogger();

  if (allCommands().length === 0) await loadPlugins();
}
