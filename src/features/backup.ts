import { copyFile, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { config } from "../config.ts";
import { kv } from "../db/kv.ts";

export async function createBackup(options: { includeLogin: boolean }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const folder = path.join(os.tmpdir(), "asena-backups");
  await mkdir(folder, { recursive: true });

  const payload = {
    version: 2,
    createdAt: Date.now(),
    tenant: config.tenantId,
    settings: await kv.all(),
  };
  const json = JSON.stringify(payload, null, 2);
  const jsonPath = path.join(folder, `backup-${stamp}.json`);
  await writeFile(jsonPath, json, "utf8");

  let loginCopyPath: string | null = null;
  if (options.includeLogin && !config.database.usePostgres) {
    loginCopyPath = path.join(folder, `session-${stamp}.db`);
    await copyFile(config.database.sessionFile, loginCopyPath).catch(() => {
      loginCopyPath = null;
    });
  }

  const checksum = new Bun.CryptoHasher("sha256").update(json).digest("hex").slice(0, 16);
  return { jsonPath, loginCopyPath, checksum };
}
