import * as zapo from "zapo-js";
import * as bot from "../bot/client.ts";
import { config } from "../config.ts";
import type { Ctx } from "../core/context.ts";
import { kv } from "../db/kv.ts";
import { calls } from "../features/calls.ts";
import { getGroup } from "../features/groups.ts";

const transpiler = new Bun.Transpiler({ loader: "ts" });

export function evalScope(ctx: Ctx) {
  return {
    ctx,
    client: ctx.client,
    calls,
    voip: (ctx.client as unknown as { voip?: unknown }).voip,
    chat: ctx.chat,
    event: ctx.event,
    quoted: ctx.message.quoted,
    reply: (value: unknown) => ctx.reply(typeof value === "string" ? value : Bun.inspect(value)),
    send: bot.send,
    group: (jid: string = ctx.chat) => getGroup(jid),
    kv,
    config,
    zapo,
    proto: zapo.proto,
  };
}

export function compile(code: string, names: string[]): (scope: object) => Promise<unknown> {
  const build = (body: string) => {
    const source = `var __run = async function ({ ${names.join(", ")} }) {\n${body}\n};`;
    return new Function(`${transpiler.transformSync(source)}\nreturn __run;`)();
  };
  try {
    return build(`return (${code}\n);`);
  } catch {
    return build(code);
  }
}

export function stripCodeFence(text: string): string {
  return text.replace(/^```(?:ts|js|typescript|javascript)?\s*\n?/i, "").replace(/\n?```\s*$/, "");
}
