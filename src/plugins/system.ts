import { config } from "../config.ts";
import { sendText } from "../bot/client.ts";
import { command } from "../core/command.ts";
import { clearAudit, queryAudit } from "../features/audit.ts";
import { createBackup } from "../features/backup.ts";
import { getFlags, KNOWN_FLAGS, setFlag } from "../features/flags.ts";
import { t } from "../features/i18n.ts";
import { ensureLogGroup, isLogGroup, setLogGroupJid, systemLog } from "../features/logGroup.ts";
import { metricsSnapshot } from "../features/metrics.ts";
import { getPolicies, POLICY_NAMES, setPolicy } from "../features/policy.ts";
import { queueStats } from "../features/queue.ts";
import { runSetup } from "../features/setup.ts";
import { formatUptime } from "../lib/format.ts";
import { errorMessage } from "../lib/logger.ts";

const p = config.prefix;

command({
  name: "createlog",
  description: "Create (or find) the system log group",
  category: "owner",
  permission: "owner",
  audit: true,
  run: async (ctx) => {
    await setLogGroupJid(null);
    const result = await ensureLogGroup();
    if (!result.jid) {
      await ctx.replyFail(result.error ?? "Could not create the log group.");
      return;
    }
    await ctx.replyOk(`${result.created ? "Created" : "Using"} system group:\n\`${result.jid}\``);
  },
});

command({
  name: "setlog",
  description: "Make this the system group",
  category: "owner",
  permission: "owner",
  groupOnly: true,
  audit: true,
  run: async (ctx) => {
    await setLogGroupJid(ctx.chat);
    await ctx.replyOk(`This group is now the *system log group*.\nRun \`${p}setup\` here. Error details will only appear here.`);
    systemLog("success", `Log group set to ${ctx.chat}`);
  },
});

command({
  name: "setup",
  description: "Setup wizard",
  category: "owner",
  usage: "[answer | skip | reset]",
  permission: "sudo",
  run: async (ctx) => {
    await ctx.reply(await runSetup(ctx.args, ctx.chat));
  },
});

command({
  name: "broadcast",
  description: "Message every group",
  category: "owner",
  usage: "<message>",
  permission: "owner",
  flag: "broadcast",
  audit: true,
  run: async (ctx) => {
    if (!ctx.args) {
      await ctx.replyFail(`Usage: \`${p}broadcast <message>\``);
      return;
    }

    await ctx.withTyping(async () => {
      const groups = await ctx.client.group.queryAllGroups();
      let sent = 0;
      for (const group of groups) {
        try {
          await sendText(group.jid, `*Broadcast*\n\n${ctx.args}`);
          sent += 1;
        } catch {
        }
        // Small pause between groups so WhatsApp does not flag the account.
        await Bun.sleep(400);
      }
      await ctx.replyOk(t("BROADCAST_DONE", { ok: sent, total: groups.length }));
    });
  },
});

command({
  name: "audit",
  description: "Audit log",
  category: "owner",
  usage: "[action] [count] | clear",
  permission: "sudo",
  run: async (ctx) => {
    if (!isLogGroup(ctx.chat)) {
      await ctx.replyFail(`Use \`${p}audit\` in the system log group.`);
      return;
    }

    if (ctx.args.toLowerCase() === "clear") {
      await clearAudit();
      await ctx.replyOk("Audit log cleared.");
      return;
    }

    const words = ctx.args.split(/\s+/).filter(Boolean);
    const count = Number(words.find((word) => /^\d+$/.test(word)) ?? 15);
    const action = words.find((word) => !/^\d+$/.test(word));
    const rows = await queryAudit({ limit: count, action });

    if (rows.length === 0) {
      await ctx.reply("*Audit log:* _(empty)_");
      return;
    }
    const lines = rows.map((row) => {
      const time = new Date(row.time).toISOString().slice(5, 16).replace("T", " ");
      return `• \`${time}\` *${row.action}* by ${row.actor}${row.chat ? `\n   in ${row.chat}` : ""}`;
    });
    await ctx.reply(`*Audit log (newest first)*\n${lines.join("\n")}`);
  },
});

command({
  name: "flag",
  description: "Turn features on or off for everyone",
  category: "owner",
  usage: "[list | <name> on|off]",
  permission: "sudo",
  audit: true,
  run: async (ctx) => {
    const [name, state] = ctx.args.toLowerCase().split(/\s+/);

    if (!name || name === "list") {
      const flags = await getFlags();
      const lines = Object.entries(flags).map(([flag, on]) => `• ${flag}: *${on ? "ON" : "OFF"}*`);
      await ctx.reply(`*Feature flags*\n${lines.join("\n")}\n\nUsage: \`${p}flag ytdl off\``);
      return;
    }

    if (state !== "on" && state !== "off") {
      await ctx.replyFail(`Usage: \`${p}flag <name> on|off\`\nFlags: ${KNOWN_FLAGS.join(", ")}`);
      return;
    }

    try {
      await setFlag(name, state === "on");
      await ctx.replyOk(`Flag *${name}* is now *${state.toUpperCase()}*`);
    } catch (error) {
      await ctx.replyFail(errorMessage(error));
    }
  },
});

command({
  name: "policy",
  description: "Global rules for users",
  category: "owner",
  usage: "[list | <name> <value>]",
  permission: "sudo",
  audit: true,
  run: async (ctx) => {
    const [name, ...rest] = ctx.args.split(/\s+/).filter(Boolean);

    if (!name || name === "list") {
      const policies = await getPolicies();
      const lines = Object.entries(policies).map(([key, value]) => `• ${key}: \`${value ?? "none"}\``);
      await ctx.reply(
        `*Policies*\n${lines.join("\n")}\n\n` +
          `Examples:\n\`${p}policy rateLimitPerUser 30\`\n\`${p}policy quietHoursStart 22:00\`\n\`${p}policy allowMediaCommands off\``,
      );
      return;
    }

    try {
      const policies = await setPolicy(name, rest.join(" "));
      await ctx.replyOk(`Policy *${name}* = \`${policies[name as keyof typeof policies] ?? "none"}\``);
    } catch (error) {
      await ctx.replyFail(`${errorMessage(error)}\nPolicies: ${POLICY_NAMES.join(", ")}`);
    }
  },
});

command({
  name: "backup",
  description: "Export bot settings (full = with login)",
  category: "owner",
  usage: "[full]",
  permission: "owner",
  audit: true,
  run: async (ctx) => {
    const includeLogin = ctx.args.toLowerCase() === "full";
    if (includeLogin && !isLogGroup(ctx.chat)) {
      await ctx.replyFail("A full backup contains your WhatsApp login. Run it in the system log group.");
      return;
    }

    const backup = await createBackup({ includeLogin });
    await ctx.send({
      type: "document",
      media: backup.jsonPath,
      mimetype: "application/json",
      fileName: `asena-backup-${backup.checksum}.json`,
      caption: `✓ Backup ready\nSHA-256: \`${backup.checksum}\``,
    });

    if (backup.loginCopyPath) {
      await ctx.send({
        type: "document",
        media: backup.loginCopyPath,
        mimetype: "application/vnd.sqlite3",
        fileName: "session.db",
        caption: "WhatsApp login database. Keep it private: anyone with it can use this account.",
      });
    }
  },
});

command({
  name: "metrics",
  description: "Show runtime counters",
  category: "owner",
  permission: "sudo",
  run: async (ctx) => {
    const m = metricsSnapshot();
    const q = queueStats();
    await ctx.reply(
      [
        `*Metrics*`,
        `• Uptime: ${formatUptime(m.uptimeSeconds)}`,
        `• Commands: ${m.counters.commands ?? 0}`,
        `• Errors: ${m.counters.errors ?? 0} (last minute: ${m.errorsLastMinute})`,
        `• Jobs ok/failed: ${m.counters.jobs_ok ?? 0}/${m.counters.jobs_failed ?? 0}`,
        `• Average job: ${m.averageJobMs} ms`,
        `• Queue: ${q.running} running, ${q.waiting} waiting`,
        `• Tenant: \`${config.tenantId}\``,
      ].join("\n"),
    );
  },
});
