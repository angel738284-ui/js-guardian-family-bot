import type { Ctx } from "../core/context.ts";
import type { WaGroupEvent } from "zapo-js";
import { getClient, send, sendText } from "../bot/client.ts";
import { isPrivileged, ownerNumbers } from "./access.ts";
import { forgetGroup, getGroup, isBotAdmin, isGroupAdmin } from "./groups.ts";
import { getLogGroupJid, systemLog } from "./logGroup.ts";
import { mentionTag, normalizeId } from "../lib/jid.ts";
import { blockedLinkIn, countInWindow, memberAliases } from "./jsGuardianLogic.ts";
import {
  bannedAliases, guardianWarnings, getGuardianConfig, saveGuardianAudit,
  setBannedAliases, updateGuardianWarnings, type GuardianAudit
} from "./jsGuardianStore.ts";
import { logger, errorMessage } from "../lib/logger.ts";
import { classifySticker } from "./stickerSafety.ts";

const stickerTimes = new Map<string, number[]>();
const warnedBurstAt = new Map<string, number>();
const MINUTE = 60_000;
const WARN_LIMIT = 3;

export async function reportModerationEvidence(ctx: Ctx, reason: string, sticker = false): Promise<void> {
  const destination = getLogGroupJid();
  if (!destination) return;
  const description = [
    "🔎 *EVIDENCIA DE MODERACIÓN*",
    "👤 Usuario: " + normalizeId(ctx.sender),
    "👥 Grupo: " + ctx.chat,
    "⚠️ Motivo: " + reason,
    "🆔 Mensaje: " + (ctx.event.key?.id ?? "desconocido")
  ];
  if (!sticker) {
    description.push("💬 Texto original:\n" + (ctx.text.trim().slice(0, 1800) || "(sin texto recuperable)"));
    await sendText(destination, description.join("\n")).catch(err => logger.warn("Evidencia de texto falló: " + errorMessage(err)));
    return;
  }
  description.push("📎 Sticker original a continuación:");
  await sendText(destination, description.join("\n")).catch(err => logger.warn("Informe de sticker falló: " + errorMessage(err)));
  try {
    const bytes = await ctx.client.message.downloadBytes(ctx.event);
    if (!bytes?.length || bytes.length > 2_500_000) throw new Error("Sticker no recuperable o demasiado grande");
    await send(destination, { type: "sticker", media: bytes, mimetype: "image/webp" });
  } catch (err) {
    logger.warn("Evidencia de sticker falló: " + errorMessage(err));
    await sendText(destination, "⚠️ No se pudo adjuntar el sticker original.").catch(() => {});
  }
}

async function reportStickerEvidence(ctx: Ctx, category: string, confidence: number): Promise<void> {
  const destination = getLogGroupJid();
  if (!destination) return;
  const reason = category === "explicit_sex" ? "Contenido sexual explícito" : "Violencia gráfica extrema";
  await sendText(destination, [
    "🔎 *EVIDENCIA DE MODERACIÓN*",
    "👤 Usuario: " + normalizeId(ctx.sender),
    "👥 Grupo: " + ctx.chat,
    "⚠️ Motivo: " + reason,
    "🤖 Confianza declarada: " + Math.round(confidence * 100) + "%",
    "📎 Sticker original a continuación (si se puede recuperar).",
    "La clasificación automática puede equivocarse."
  ].join("\n")).catch(err => logger.warn("No se pudo enviar informe: " + errorMessage(err)));
  try {
    const bytes = await ctx.client.message.downloadBytes(ctx.event);
    if (!bytes?.length || bytes.length > 2_500_000) return;
    await send(destination, { type: "sticker", media: bytes, mimetype: "image/webp" });
  } catch (err) {
    logger.warn("No se pudo enviar sticker de evidencia: " + errorMessage(err));
    await sendText(destination, "⚠️ No se pudo recuperar el sticker original para revisión.").catch(() => {});
  }
}

export async function guardianLog(data: GuardianAudit): Promise<void> {
  try { await saveGuardianAudit(data); }
  catch (err) { logger.warn("No se pudo guardar el registro JS Guardian: " + errorMessage(err)); }
  const text = `${data.action} | Grupo: ${data.group_id} | Responsable: ${data.actor_id ?? "automático"} | Usuario: ${data.target_id ?? "-"}${data.details ? " | " + data.details : ""}`;
  if (getLogGroupJid()) systemLog("info", "JS Guardian · " + text);
}

export async function guardianCanonicalId(group: string, target: string, aliases: string[] = []): Promise<string> {
  const metadata = await getGroup(group);
  const all = memberAliases([target, ...aliases]);
  const p = metadata.participants.find(member =>
    [member.jid, (member as any).phoneJid, (member as any).lidJid].some(jid => all.includes(normalizeId(jid))));
  return normalizeId(p?.jid ?? target);
}
export async function guardianWarn(group: string, actor: string, target: string, aliases: string[] = [], intro = ""): Promise<{ count: number; removed: boolean }> {
  const key = await guardianCanonicalId(group, target, aliases);
  const count = await updateGuardianWarnings(group, key, "increment");
  const label = mentionTag(target);
  await guardianLog({ group_id: group, action: "ADVERTENCIA", actor_id: actor, target_id: key, details: `${count}/${WARN_LIMIT}` });
  if (count < WARN_LIMIT) {
    await sendText(group, `${intro ? intro + "\n" : ""}⚠️ ${label} recibió una advertencia (${count}/${WARN_LIMIT}). A la tercera será expulsado.`, [target]);
    return { count, removed: false };
  }
  const metadata = await getGroup(group);
  const targetIds = memberAliases([target, ...aliases]);
  const participant = metadata.participants.find(p => [p.jid, (p as any).phoneJid, (p as any).lidJid].some(jid => targetIds.includes(normalizeId(jid))));
  if (!participant || participant.isAdmin || participant.isSuperAdmin || !isBotAdmin(metadata)) {
    await sendText(group, `⚠️ ${label} llegó a 3 advertencias, pero no se pudo expulsar. Revisá los permisos del bot.`, [target]);
    return { count, removed: false };
  }
  const [result] = await getClient()!.group.removeParticipants(group, [participant.jid]);
  if (result?.status !== "ok") {
    await sendText(group, `⚠️ ${label} llegó a 3 advertencias; expulsión fallida (${result?.code ?? "?"}).`, [target]);
    return { count, removed: false };
  }
  forgetGroup(group);
  await updateGuardianWarnings(group, key, "reset");
  await guardianLog({ group_id: group, action: "EXPULSIÓN POR 3 ADVERTENCIAS", actor_id: actor, target_id: key });
  await sendText(group, `🚫 ${label} fue expulsado por acumular 3 advertencias.`, [target]);
  return { count, removed: true };
}

export async function runGuardianGuards(ctx: Ctx): Promise<boolean> {
  if (!ctx.isGroup || ctx.fromMe || ctx.chat === getLogGroupJid()) return false;
  try {
    const [config, group] = await Promise.all([getGuardianConfig(ctx.chat), getGroup(ctx.chat)]);
    if (!isBotAdmin(group)) return false;
    if (isGroupAdmin(group, ctx.senderIds) || await isPrivileged(ctx)) return false;
    if (ctx.message.type === "sticker" && config.antiExplicitSticker) {
      const verdict = await classifySticker(ctx);
      if (verdict && (verdict.category === "explicit_sex" || verdict.category === "graphic_gore") && verdict.confidence >= 0.98) {
        await reportStickerEvidence(ctx, verdict.category, verdict.confidence);
        await send(ctx.chat, { type: "revoke", target: ctx.event }).catch(() => {});
        const result = await guardianBan(ctx.chat, ctx.sender, "DETECTOR_VISUAL");
        await guardianLog({ group_id: ctx.chat, action: "STICKER EXPLÍCITO", actor_id: "DETECTOR_VISUAL", target_id: normalizeId(ctx.sender), details: verdict.category + " " + verdict.confidence });
        await sendText(ctx.chat, result.removed ? "🚫 Sticker explícito eliminado. Usuario expulsado y bloqueado." : "🚫 Sticker explícito detectado. Usuario bloqueado; revisá los permisos de expulsión.").catch(() => {});
        return true;
      }
    }
    if (ctx.message.type === "sticker" && config.antiSticker) {
      const key = `${ctx.chat}|${ctx.senderIds[0] ?? ctx.sender}`;
      const now = Date.now();
      const recent = countInWindow(stickerTimes.get(key) ?? [], now, MINUTE);
      stickerTimes.set(key, recent);
      if (recent.length > 2) {
        await reportModerationEvidence(ctx, "Exceso de stickers (ANTISTICKERS)", true);
        await send(ctx.chat, { type: "revoke", target: ctx.event }).catch(() => {});
        if (now - (warnedBurstAt.get(key) ?? 0) >= MINUTE) {
          warnedBurstAt.set(key, now);
          await guardianWarn(ctx.chat, "ANTISTICKERS", ctx.sender, ctx.senderIds);
        }
        return true;
      }
    }
    if (config.antiLink && blockedLinkIn(ctx.text, config.allowedDomains)) {
      const destination = getLogGroupJid();
      if (destination) await sendText(destination, "🔎 *MENSAJE ELIMINADO POR ENLACE*\n👤 Usuario: " + normalizeId(ctx.sender) + "\n👥 Grupo: " + ctx.chat + "\n💬 Mensaje original:\n" + ctx.text.slice(0, 1800)).catch(() => {});
      await send(ctx.chat, { type: "revoke", target: ctx.event }).catch(() => {});
      await guardianLog({ group_id: ctx.chat, action: "ENLACE BORRADO", actor_id: "ANTILINK", target_id: normalizeId(ctx.sender), details: "Enlace no permitido" });
      await sendText(ctx.chat, `🔗 ${mentionTag(ctx.sender)}, ese enlace no está permitido.`, [ctx.sender]).catch(() => {});
      return true;
    }
    return false;
  } catch (err) {
    logger.warn("Guardia JS falló, se mantienen las protecciones básicas: " + errorMessage(err));
    return false;
  }
}
export async function handleGuardianJoin(event: WaGroupEvent): Promise<void> {
  if (event.action !== "add" || !event.groupJid || event.groupJid === getLogGroupJid()) return;
  try {
    const group = await getGroup(event.groupJid);
    if (!isBotAdmin(group)) return;
    for (const p of event.participants ?? []) {
      if (!p.jid) continue;
      const ids = memberAliases([p.jid, p.lidJid, p.phoneJid]);
      if (!(await bannedAliases(event.groupJid, ids))) continue;
      const [result] = await getClient()!.group.removeParticipants(event.groupJid, [p.jid]);
      if (result?.status !== "ok") {
        logger.warn(`No se pudo expulsar al baneado ${ids.join("/")}: ${result?.code ?? "?"}`);
        continue;
      }
      forgetGroup(event.groupJid);
      await guardianLog({ group_id: event.groupJid, action: "REINGRESO DE BANEADO BLOQUEADO", actor_id: "GUARDIAN", target_id: ids.join(",") });
      await sendText(event.groupJid, "🚫 Un usuario de la lista negra fue expulsado nuevamente.").catch(() => {});
    }
  } catch (err) {
    logger.warn("No se pudo verificar la lista negra al ingresar: " + errorMessage(err));
  }
}
export function guardianAliasesFor(group: Awaited<ReturnType<typeof getGroup>>, target: string): string[] {
  const id = normalizeId(target);
  const member = group.participants.find(p => normalizeId(p.jid) === id || normalizeId((p as any).phoneJid) === id || normalizeId((p as any).lidJid) === id);
  return memberAliases([target, member?.jid, (member as any)?.phoneJid, (member as any)?.lidJid]);
}
export async function guardianBan(group: string, target: string, actor: string): Promise<{ removed: boolean }> {
  const metadata = await getGroup(group);
  const aliases = guardianAliasesFor(metadata, target);
  if (!aliases.length || aliases.some(id => ownerNumbers().includes(id))) throw new Error("No se puede banear al dueño.");
  const person = metadata.participants.find(p => [p.jid, (p as any).phoneJid, (p as any).lidJid].some(jid => aliases.includes(normalizeId(jid))));
  if (person?.isAdmin || person?.isSuperAdmin) throw new Error("No se puede banear a otro administrador.");
  await setBannedAliases(group, aliases, true);
  await guardianLog({ group_id: group, action: "BAN PERMANENTE", actor_id: actor, target_id: aliases.join(",") });
  if (!person || !isBotAdmin(metadata)) return { removed: false };
  const [result] = await getClient()!.group.removeParticipants(group, [person.jid]);
  if (result?.status !== "ok") return { removed: false };
  forgetGroup(group);
  return { removed: true };
}
export async function guardianUnban(group: string, target: string, actor: string): Promise<void> {
  const metadata = await getGroup(group).catch(() => null);
  const aliases = metadata ? guardianAliasesFor(metadata, target) : memberAliases([target]);
  if (!aliases.length) throw new Error("Falta el número o la mención.");
  await setBannedAliases(group, aliases, false);
  await guardianLog({ group_id: group, action: "DESBAN", actor_id: actor, target_id: aliases.join(",") });
}
