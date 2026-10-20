import type { WaGroupEvent, WaGroupEventParticipant } from "zapo-js";
import { config } from "../config.ts";
import { botIdentity, sendText } from "../bot/client.ts";
import { mentionTag, normalizeId } from "../lib/jid.ts";
import { errorMessage, logger } from "../lib/logger.ts";
import { getGroupSettings } from "./groupSettings.ts";
import { forgetGroup, getGroup } from "./groups.ts";
import { isLogGroup } from "./logGroup.ts";

function fillTemplate(template: string, values: { user: string; group: string; count: number }): string {
  return template
    .replaceAll("@user", values.user)
    .replaceAll("@group", values.group)
    .replaceAll("@count", String(values.count));
}

function isBot(participant: WaGroupEventParticipant): boolean {
  const me = botIdentity();
  const botIds = [me.jid, me.lid].filter(Boolean).map(normalizeId);
  const ids = [participant.jid, participant.lidJid, participant.phoneJid].filter(Boolean).map(normalizeId);
  return ids.some((id) => botIds.includes(id));
}

export async function handleGroupEvent(event: WaGroupEvent): Promise<void> {
  const groupJid = event.groupJid;
  if (!groupJid) return;

  forgetGroup(groupJid);

  const joined = event.action === "add";
  const left = event.action === "remove";
  if ((!joined && !left) || !event.participants?.length) return;
  if (isLogGroup(groupJid)) return;

  try {
    const settings = await getGroupSettings(groupJid);
    const group = await getGroup(groupJid).catch(() => null);
    const groupName = group?.subject ?? "this group";
    const count = group?.participants.length ?? 0;

    for (const participant of event.participants) {
      if (!participant.jid) continue;

      if (joined && isBot(participant)) {
        await sendText(
          groupJid,
          `*${config.botName}* is here.\n\n` +
            `Admins: run \`${config.prefix}groupsetup recommended\` for welcome + antilink + antispam.\n` +
            `Or \`${config.prefix}menu\` to see all commands.`,
        );
        continue;
      }

      const template = joined && settings.welcome ? settings.welcomeText : left && settings.goodbye ? settings.goodbyeText : null;
      if (!template) continue;

      const text = fillTemplate(template, { user: mentionTag(participant.jid), group: groupName, count });
      await sendText(groupJid, text, [participant.jid]);
    }
  } catch (error) {
    logger.warn(`Welcome/goodbye failed in ${groupJid}: ${errorMessage(error)}`);
  }
}
