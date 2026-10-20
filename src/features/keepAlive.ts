import { config } from "../config.ts";
import { botStatus } from "../bot/status.ts";
import { logger } from "../lib/logger.ts";

export function startKeepAlive(): void {
  if (!config.port) return;
  Bun.serve({
    port: config.port,
    hostname: "0.0.0.0",
    fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === "/health") {
        return Response.json({
          ok: true,
          connected: botStatus.connected,
          uptimeSeconds: Math.floor((Date.now() - botStatus.startedAt) / 1000),
        });
      }
      if (pathname === "/") return new Response(`${config.botName} is running.\n`);
      return new Response("Not found\n", { status: 404 });
    },
  });
  logger.info(`Keep-alive endpoint on port ${config.port} (/health)`);
}
