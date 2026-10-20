import type { WaGroupMetadata, WaGroupParticipant } from "zapo-js";
import { botIdentity, requireClient } from "../bot/client.ts";
import { TtlCache } from "../lib/cache.ts";
import { normalizeId, userPart } from "../lib/jid.ts";

const groupCache = new TtlCache<WaGroupMetadata>(3 * 60_000, 100);

export async function getGroup(jid: string): Promise<WaGroupMetadata> {
  const cached = groupCache.get(jid);
  if (cached) return cached;

  const metadata = await requireClient().group.queryGroupMetadata(jid);
  groupCache.set(jid, metadata);
  return metadata;
}

export function forgetGroup(jid: string): void {
  groupCache.delete(jid);
}

function participantIds(participant: WaGroupParticipant): string[] {
  return [participant.jid, participant.lid, participant.phoneNumber]
    .filter((id): id is string => Boolean(id))
    .map(normalizeId);
}

export function findParticipant(group: WaGroupMetadata, ids: string[]): WaGroupParticipant | null {
  const wanted = new Set(ids.map(normalizeId).filter(Boolean));
  return group.participants.find((p) => participantIds(p).some((id) => wanted.has(id))) ?? null;
}

export function isGroupAdmin(group: WaGroupMetadata, ids: string[]): boolean {
  const participant = findParticipant(group, ids);
  return Boolean(participant?.isAdmin || participant?.isSuperAdmin);
}

export function isBotAdmin(group: WaGroupMetadata): boolean {
  const me = botIdentity();
  return isGroupAdmin(
    group,
    [me.jid, me.lid].filter((id): id is string => Boolean(id)),
  );
}

export function groupAdmins(group: WaGroupMetadata): WaGroupParticipant[] {
  return group.participants.filter((p) => p.isAdmin || p.isSuperAdmin);
}

export function participantLabel(participant: WaGroupParticipant): string {
  return userPart(participant.phoneNumber ?? participant.jid);
}

export function formatGroupInfo(group: WaGroupMetadata): string {
  const admins = groupAdmins(group);
  const superAdmins = admins.filter((p) => p.isSuperAdmin);

  const lines = [
    `*Group information*`,
    ``,
    `*Name:* ${group.subject}`,
    `*Group ID:* ${group.jid}`,
  ];

  if (group.creation) lines.push(`*Created:* ${new Date(group.creation * 1000).toLocaleDateString()}`);
  if (group.owner) lines.push(``, `*Owner:* ${userPart(group.ownerPhoneNumber ?? group.owner)}`);

  lines.push(
    ``,
    `*Members*`,
    `• Total: ${group.participants.length}`,
    `• Super admins: ${superAdmins.length}`,
    `• Admins: ${admins.length - superAdmins.length}`,
    `• Regular: ${group.participants.length - admins.length}`,
    ``,
    `*Settings*`,
    `• Send messages: ${group.announce ? "Only admins" : "All members"}`,
    `• Edit group info: ${group.restrict ? "Only admins" : "All members"}`,
  );

  if (group.desc) lines.push(``, `*Description*`, group.desc);
  return lines.join("\n");
}
