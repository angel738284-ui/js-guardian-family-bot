import { timingSafeEqual } from "node:crypto";
import { config } from "../config.ts";
import { getClient } from "../bot/client.ts";
import { logger } from "../lib/logger.ts";
import { getMode } from "./access.ts";
import { queryAudit } from "./audit.ts";
import { getFlags } from "./flags.ts";
import { getLogGroupJid, isSetupDone } from "./logGroup.ts";
import { metricsPrometheus, metricsSnapshot } from "./metrics.ts";
import { getPolicies } from "./policy.ts";
import { queueStats } from "./queue.ts";

function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isAuthorized(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") && tokenMatches(header.slice(7), config.adminHttp.token);
}

export function startAdminHttp(): void {
  const { port, host, token } = config.adminHttp;
  if (!port) return;
  if (!token) {
    logger.warn("ADMIN_HTTP_PORT is set but ADMIN_HTTP_TOKEN is missing. Admin HTTP not started.");
    return;
  }

  Bun.serve({
    port,
    hostname: host,
    async fetch(request) {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return Response.json({
          ok: true,
          name: config.botName,
          version: config.version,
          connected: Boolean(getClient()?.getCredentials()),
          mode: await getMode(),
          setupDone: await isSetupDone(),
          logGroup: Boolean(getLogGroupJid()),
          queue: queueStats(),
        });
      }

      if (!isAuthorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });

      switch (url.pathname) {
        case "/metrics":
          return url.searchParams.get("format") === "prom"
            ? new Response(metricsPrometheus(), { headers: { "Content-Type": "text/plain; version=0.0.4" } })
            : Response.json(metricsSnapshot());
        case "/flags":
          return Response.json(await getFlags());
        case "/policies":
          return Response.json(await getPolicies());
        case "/audit":
          return Response.json(
            await queryAudit({
              limit: Number(url.searchParams.get("limit") ?? 50),
              action: url.searchParams.get("action") ?? undefined,
            }),
          );
        default:
          return Response.json({ error: "not_found" }, { status: 404 });
      }
    },
  });

  logger.info(`Admin HTTP listening on http://${host}:${port}`);
}
