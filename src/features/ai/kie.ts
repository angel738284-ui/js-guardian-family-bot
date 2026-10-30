import type { Ctx } from "../../core/context.ts";
import { botIdentity } from "../../bot/client.ts";
import { isOwner } from "../access.ts";
import { normalizeId } from "../../lib/jid.ts";
import { kv } from "../../db/kv.ts";
import { logger } from "../../lib/logger.ts";

const ENDPOINT = "https://api.kie.ai/codex/v1/responses";
const userTimes = new Map<string, number>();
const hourCounts = new Map<string, { at: number; n: number }>();
let active = false;
let lastRequest = 0;
let daily = { day: "", count: 0 };

export const kieConfigured = () => Boolean(process.env.KIE_API_KEY?.trim());
export const kieEnabled = async (chat: string) => (await kv.get<boolean>("kie_off:" + chat)) !== true;
export const setKieEnabled = async (chat: string, yes: boolean) => kv.set("kie_off:" + chat, yes ? null : true);

function tagged(ctx: Ctx): boolean {
  const bot = botIdentity();
  const ids = [bot.jid, bot.lid].filter((x): x is string => Boolean(x)).map(normalizeId);
  return ctx.message.mentions.some(id => ids.includes(normalizeId(id)))
    || Boolean(ctx.message.quoted && ids.includes(normalizeId(ctx.message.quoted.sender)))
    || /\bjs[ -]?(?:guardian|bot[ -]?adm)\b/i.test(ctx.text);
}
export async function shouldAnswerWithKie(ctx: Ctx): Promise<boolean> {
  if (!kieConfigured() || !ctx.text.trim() || ctx.fromMe) return false;
  if (ctx.isGroup ? !tagged(ctx) : !isOwner(ctx)) return false;
  return kieEnabled(ctx.chat);
}

interface KiePart { type?: string; text?: string }
interface KieOutput { type?: string; content?: KiePart[] }
interface KieBody { code?: number; msg?: string; error?: {message?: string}; output?: KieOutput[]; status?: string }

function extract(body: KieBody): string {
  const parts = (body.output ?? []).filter(x => x.type === "message")
    .flatMap(x => (x.content ?? []).filter(p => p.type === "output_text").map(p => p.text || ""));
  return parts.join("\n").trim().slice(0, 1800);
}

export async function kieGenerate(question: string, username = ""): Promise<string> {
  const model = process.env.KIE_MODEL || "gpt-6-luna";
  const instructions = [
    "Sos JS Guardian de JS Family, comunidad de Free Fire Argentina.",
    "Contestá en español argentino, con humor ligero y no más de 110 palabras.",
    "No podés ejecutar acciones reales: /ban, /warn y /promord son herramientas aparte.",
    "No inventes promociones ni precios actuales.",
    username ? "La persona se llama " + username.slice(0,45) : "",
  ].filter(Boolean).join(" ");
  const token = process.env.KIE_API_KEY?.trim();
  if (!token) throw new Error("Falta configurar la clave KIE_API_KEY.");
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, stream:false, reasoning:{effort:"low"}, max_output_tokens:400,
      input:[{role:"system",content:instructions},{role:"user",content:question.slice(0,1100)}],
    }),
    signal: AbortSignal.timeout(35_000),
  });
  const body = await response.json().catch(() => null) as KieBody | null;
  const status = Number(body?.code ?? response.status);
  if (!response.ok || status >= 400 || body?.error) {
    if (status === 401) throw new Error("Kie rechazó la API key.");
    if (status === 402) throw new Error("Kie indica que no quedan créditos.");
    if (status === 429) throw new Error("Kie está limitando las consultas. Probá más tarde.");
    throw new Error("Kie no pudo responder (HTTP " + status + ").");
  }
  const answer = body ? extract(body) : "";
  if (!answer) throw new Error("Kie no devolvió texto. Verificá el modelo.");
  return answer;
}

function limit(ctx: Ctx): string | null {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0,10);
  if (daily.day !== today) daily = { day:today, count:0 };
  if (daily.count >= 80) return "Alcancé el límite diario de JS Guardian. Mañana seguimos.";
  if (active || now - lastRequest < 6000) return "Estoy ocupado. Probá en unos segundos.";
  const who = ctx.chat + ":" + normalizeId(ctx.sender);
  if (now - (userTimes.get(who) || 0) < 60_000)
    return "Para cuidar los créditos, esperá un minuto antes de otra pregunta.";
  const entry = hourCounts.get(ctx.chat);
  const hour = entry && now - entry.at < 3600000 ? entry : {at:now,n:0};
  if (hour.n >= 18) return "El grupo alcanzó el límite de IA por esta hora.";
  hour.n++;
  hourCounts.set(ctx.chat,hour);
  userTimes.set(who,now);
  daily.count++;
  lastRequest = now;
  return null;
}

export async function answerWithKie(ctx: Ctx): Promise<void> {
  const warning = limit(ctx);
  if (warning) { await ctx.reply(warning); return; }
  active = true;
  try {
    const reply = await kieGenerate(ctx.text, ctx.pushName);
    await ctx.reply(reply);
  } catch (e) {
    const message = e instanceof Error ? e.message : "No disponible.";
    logger.warn("Kie IA: " + message);
    await ctx.reply("⚠️ " + message).catch(() => {});
  } finally {
    active = false;
  }
}
