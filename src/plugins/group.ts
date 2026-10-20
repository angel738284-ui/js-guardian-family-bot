import { config } from "../config.ts";
import { botIdentity, send, sendText } from "../bot/client.ts";
import { command } from "../core/command.ts";
import type { Ctx } from "../core/context.ts";
import { calls } from "../features/calls.ts";
import { formatGroupInfo, forgetGroup, getGroup, groupAdmins, participantLabel } from "../features/groups.ts";
import { isLidJid, mentionTag, normalizeId } from "../lib/jid.ts";

command({
  name: "tagall",
  description: "Tag every member with a numbered list",
  category: "group",
  permission: "sudo",
  groupOnly: true,
  run: async (ctx) => {
    const group = await ctx.group();
    const lines = [`*${group.subject}*`, `Members: ${group.participants.length}`, ``];
    group.participants.forEach((member, index) => lines.push(`${index + 1}. @${participantLabel(member)}`));

    await ctx.reply(lines.join("\n"), { mentions: group.participants.map((member) => member.jid) });
  },
});

command({
  name: "mention",
  aliases: ["notify"],
  description: "Notify every member",
  category: "group",
  usage: "[text]",
  groupOnly: true,
  adminOnly: true,
  run: async (ctx) => {
    const group = await ctx.group();
    const text = ctx.args || ctx.message.quoted?.text || "*Attention, everyone.*";
    await ctx.reply(text, { mentions: group.participants.map((member) => member.jid) });
  },
});

command({
  name: "groupinfo",
  description: "Show group details",
  category: "group",
  groupOnly: true,
  run: async (ctx) => {
    const group = await ctx.group();
    const lidCount = group.participants.filter((member) => isLidJid(member.jid)).length;
    await ctx.reply(
      `${formatGroupInfo(group)}\n\n*ID types*\n• Private IDs (LID): ${lidCount}\n• Phone IDs: ${group.participants.length - lidCount}`,
    );
  },
});

command({
  name: "admins",
  description: "List the group admins",
  category: "group",
  groupOnly: true,
  run: async (ctx) => {
    const group = await ctx.group();
    const admins = groupAdmins(group);
    const lines = [`*Admins of ${group.subject}* (${admins.length})`, ``];
    admins.forEach((admin, index) =>
      lines.push(`${index + 1}. @${participantLabel(admin)} – ${admin.isSuperAdmin ? "creator" : "admin"}`),
    );
    await ctx.reply(lines.join("\n"), { mentions: admins.map((admin) => admin.jid) });
  },
});

async function changeAdminRole(ctx: Ctx, makeAdmin: boolean): Promise<void> {
  const target = ctx.target();
  if (!target) {
    await ctx.replyFail(`Mention a user or reply to their message.\nUsage: \`${config.prefix}${ctx.command} @user\``);
    return;
  }

  const results = makeAdmin
    ? await ctx.client.group.promoteParticipants(ctx.chat, [target])
    : await ctx.client.group.demoteParticipants(ctx.chat, [target]);
  forgetGroup(ctx.chat);

  if (results[0]?.status !== "ok") {
    await ctx.replyFail(`Could not change ${mentionTag(target)} (code ${results[0]?.code ?? "?"}).`, { mentions: [target] });
    return;
  }
  await ctx.replyOk(`${mentionTag(target)} is ${makeAdmin ? "now an admin" : "no longer an admin"}.`, { mentions: [target] });
}

command({
  name: "promote",
  description: "Make a member admin",
  category: "group",
  usage: "@user",
  adminOnly: true,
  botAdmin: true,
  audit: true,
  run: (ctx) => changeAdminRole(ctx, true),
});

command({
  name: "demote",
  description: "Remove admin rights",
  category: "group",
  usage: "@user",
  adminOnly: true,
  botAdmin: true,
  audit: true,
  run: (ctx) => changeAdminRole(ctx, false),
});

async function groupThumbnail(ctx: Ctx): Promise<Uint8Array | null> {
  try {
    const picture = await ctx.client.profile.getProfilePicture(ctx.chat, "preview");
    if (!picture.url) return null;
    const response = await fetch(picture.url, { signal: AbortSignal.timeout(10_000) });
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

command({
  name: "invite",
  description: "Invite card for this group",
  category: "group",
  usage: "[@user|number] (empty = post it here)",
  adminOnly: true,
  botAdmin: true,
  run: async (ctx) => {
    const group = await ctx.group();
    const code = await ctx.client.group.queryInviteCode(ctx.chat);
    const thumbnail = await groupThumbnail(ctx);

    const card = {
      groupInviteMessage: {
        groupJid: ctx.chat,
        inviteCode: code,
        inviteExpiration: Math.floor(Date.now() / 1000) + 3 * 86_400,
        groupName: group.subject,
        caption: `Join *${group.subject}* on WhatsApp\nhttps://chat.whatsapp.com/${code}`,
        ...(thumbnail ? { jpegThumbnail: thumbnail } : {}),
      },
    };

    const typed = ctx.args.replace(/\D/g, "");
    const target = ctx.message.mentions[0] ?? (typed ? `${typed}@s.whatsapp.net` : null);

    if (!target) {
      await ctx.send(card);
      return;
    }
    await send(target, card);
    await ctx.replyOk(`Invite sent to ${mentionTag(target)}`, { mentions: [target] });
  },
});

command({
  name: "gcall",
  description: "Start a group voice call; the bot stays until everyone leaves",
  category: "group",
  usage: "[end]",
  groupOnly: true,
  adminOnly: true,
  run: async (ctx) => {
    if (!calls.enabled()) {
      await ctx.replyFail("Calls are not available on this bot.");
      return;
    }

    const current = calls.inGroup(ctx.chat);
    if (ctx.args.trim().toLowerCase() === "end") {
      if (!current) {
        await ctx.replyFail("There is no group call running here.");
        return;
      }
      await current.hangUp();
      await ctx.replyOk("Left the group call.");
      return;
    }
    if (current) {
      await ctx.replyFail(`A group call is already running. Use \`${config.prefix}gcall end\` to leave it.`);
      return;
    }

    const group = await getGroup(ctx.chat);
    const me = botIdentity();
    const mine = new Set([me.jid, me.lid].filter((id): id is string => Boolean(id)).map(normalizeId));
    const members = group.participants
      .filter((member) => ![member.jid, member.lid, member.phoneNumber].some((id) => id && mine.has(normalizeId(id))))
      .map((member) => member.lid ?? member.jid)
      .slice(0, 31);

    const call = await calls.startGroup(ctx.chat, members);
    await ctx.replyOk(`Calling ${members.length} ${members.length === 1 ? "member" : "members"}. I will stay until everyone leaves.`);

    void call.ended().then(() => {
      const minutes = Math.round((call.duration ?? 0) / 60);
      return sendText(ctx.chat, minutes ? `_Group call ended after ${minutes} min._` : "_Group call ended._").catch(() => {});
    });
  },
});
