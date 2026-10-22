import type { WaIncomingPresenceEvent } from "zapo-js";
import { config } from "../config.ts";
import { command } from "../core/command.ts";
import { getGroupSettings, updateGroupSettings } from "../features/groupSettings.ts";
import { getGroupStats, resetGroupStats } from "../features/groupStats.ts";
import { forgetGroup, isBotAdmin, isGroupAdmin } from "../features/groups.ts";
import { getSchedules, getTimezone, setTimezone } from "../features/schedule.ts";
import { mentionTag, normalizeId, phoneToJid, userPart } from "../lib/jid.ts";
import { inviteCode, nextValue, onOff } from "../lib/args.ts";
import { scheduleCommand } from "../lib/group.ts";
import { ONLINE_MAX_MEMBERS, ONLINE_WAIT_MS } from "../lib/constants.ts";

command({
  name: "add",
  description: "Add people to the group by number",
  category: "group",
  usage: "<number> [number...]",
  adminOnly: true,
  botAdmin: true,
  audit: true,
  run: async (ctx) => {
    const numbers = ctx.args.split(/[\s,]+/).map((item) => item.replace(/\D/g, "")).filter((item) => item.length >= 7);
    if (numbers.length === 0) {
      await ctx.replyFail(`Usage: \`${config.prefix}add 2348012345678\``);
      return;
    }

    const results = await ctx.client.group.addParticipants(ctx.chat, numbers.map(phoneToJid));
    forgetGroup(ctx.chat);
    const lines = results.map((result) => {
      const who = userPart(result.phoneNumber ?? result.jid);
      if (result.status === "ok") return `✓ ${who} added`;
      if (result.code === 403) return `✕ ${who} only accepts invites. Send them \`${config.prefix}invite\`.`;
      if (result.code === 409) return `• ${who} is already here`;
      return `✕ ${who} could not be added (${result.code})`;
    });
    await ctx.reply(lines.join("\n"));
  },
});

command({
  name: "group",
  description: "Open or close the chat, lock or unlock group info",
  category: "group",
  usage: "open | close | lock | unlock",
  adminOnly: true,
  botAdmin: true,
  run: async (ctx) => {
    const settings = {
      open: ["announcement", false, "Everyone can send messages now."],
      close: ["announcement", true, "Only admins can send messages now."],
      unlock: ["restrict", false, "Everyone can edit group info now."],
      lock: ["restrict", true, "Only admins can edit group info now."],
    } as const;
    const choice = settings[ctx.args.toLowerCase() as keyof typeof settings];
    if (!choice) {
      await ctx.replyFail(`Usage: \`${config.prefix}group open | close | lock | unlock\``);
      return;
    }
    await ctx.client.group.setSetting(ctx.chat, choice[0], choice[1]);
    forgetGroup(ctx.chat);
    await ctx.replyOk(choice[2]);
  },
});

command({
  name: "leave",
  aliases: ["left"],
  description: "Make the bot leave this group",
  category: "group",
  groupOnly: true,
  permission: "sudo",
  audit: true,
  run: async (ctx) => {
    await ctx.reply("Bye 👋");
    await ctx.client.group.leaveGroup([ctx.chat]);
  },
});

command({
  name: "join",
  aliases: ["joingroup"],
  description: "Join a group with an invite link",
  category: "owner",
  usage: "<invite link>",
  permission: "sudo",
  audit: true,
  run: async (ctx) => {
    const code = inviteCode(ctx.args || ctx.message.quoted?.text || "");
    if (!code) {
      await ctx.replyFail(`Usage: \`${config.prefix}join https://chat.whatsapp.com/...\``);
      return;
    }
    const group = await ctx.client.group.joinGroupViaInvite(code);
    await ctx.replyOk(`Joined *${group.subject}*.`);
  },
});

command({
  name: "gpp",
  aliases: ["setgpp"],
  description: "Change the group photo (reply to an image)",
  category: "group",
  usage: "(reply to an image)",
  adminOnly: true,
  botAdmin: true,
  run: async (ctx) => {
    const media = await ctx.downloadMedia();
    if (!media || media.type !== "image") {
      await ctx.replyFail("Reply to an image.");
      return;
    }
    await ctx.client.profile.setProfilePicture(media.bytes, ctx.chat);
    await ctx.replyOk("Group photo updated.");
  },
});

command({
  name: "kickall",
  description: "Remove every member who is not an admin",
  category: "group",
  usage: "confirm",
  adminOnly: true,
  botAdmin: true,
  audit: true,
  run: async (ctx) => {
    const group = await ctx.group();
    const members = group.participants.filter((p) => !p.isAdmin && !p.isSuperAdmin).map((p) => p.jid);
    if (ctx.args.toLowerCase() !== "confirm") {
      await ctx.reply(`This removes *${members.length}* members who are not admins.\nSend \`${config.prefix}kickall confirm\` to do it.`);
      return;
    }
    if (members.length === 0) {
      await ctx.reply("Only admins are left.");
      return;
    }
    await ctx.client.group.removeParticipants(ctx.chat, members);
    forgetGroup(ctx.chat);
    await ctx.replyOk(`Removed ${members.length} members.`);
  },
});

command({
  name: "listonline",
  aliases: ["online"],
  description: "Members who are online right now",
  category: "group",
  groupOnly: true,
  run: async (ctx) => {
    const group = await ctx.group();
    const members = group.participants.slice(0, ONLINE_MAX_MEMBERS);
    const ids = new Map(members.flatMap((p) => [p.jid, p.lid, p.phoneNumber].filter(Boolean).map((id) => [normalizeId(id), p.jid] as const)));
    const online = new Set<string>();

    const listener = (event: WaIncomingPresenceEvent) => {
      const member = event.chatJid ? ids.get(normalizeId(event.chatJid)) : undefined;
      if (member && event.type === "available") online.add(member);
    };

    ctx.client.on("presence", listener);
    try {
      await ctx.withTyping(async () => {
        await Promise.all(members.map((p) => ctx.client.presence.subscribe(p.jid).catch(() => {})));
        await Bun.sleep(ONLINE_WAIT_MS);
      });
    } finally {
      ctx.client.off("presence", listener);
    }

    const list = [...online];
    const note = group.participants.length > ONLINE_MAX_MEMBERS ? `\n_Checked the first ${ONLINE_MAX_MEMBERS} members._` : "";
    if (list.length === 0) {
      await ctx.reply(`Nobody shows as online right now. Some people hide their online status.${note}`);
      return;
    }
    await ctx.reply(`*Online now (${list.length})*\n${list.map((jid) => `• ${mentionTag(jid)}`).join("\n")}${note}`, { mentions: list });
  },
});

command({
  name: "gstats",
  description: "Most active members in this group",
  category: "group",
  usage: "[reset]",
  groupOnly: true,
  run: async (ctx) => {
    if (ctx.args.toLowerCase() === "reset") {
      if (!isGroupAdmin(await ctx.group(), ctx.senderIds)) {
        await ctx.replyFail("Only admins can reset the stats.");
        return;
      }
      await resetGroupStats(ctx.chat);
      await ctx.replyOk("Stats reset.");
      return;
    }

    const stats = await getGroupStats(ctx.chat);
    const top = Object.entries(stats.members).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
    if (top.length === 0) {
      await ctx.reply("No messages counted yet.");
      return;
    }
    const since = new Date(stats.since).toLocaleDateString();
    const lines = top.map(([id, member], index) => `${index + 1}. ${member.name || id} – ${member.count}`);
    await ctx.reply(`*Group activity* since ${since}\nTotal messages: ${stats.total}\n\n${lines.join("\n")}`);
  },
});

command({
  name: "setwarn",
  aliases: ["warnlimit"],
  description: "Warnings before a member is removed",
  category: "group",
  usage: "<number>",
  adminOnly: true,
  run: async (ctx) => {
    const limit = Number(ctx.args);
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
      await ctx.replyFail(`Usage: \`${config.prefix}setwarn 3\` (1 to 20)`);
      return;
    }
    await updateGroupSettings(ctx.chat, { warnLimit: limit });
    await ctx.replyOk(`Members are removed after ${limit} warnings.`);
  },
});

command({
  name: "antiword",
  description: "Delete messages with banned words",
  category: "group",
  usage: "add <word> | del <word> | list | clear",
  adminOnly: true,
  run: async (ctx) => {
    const [action = "list", ...rest] = ctx.args.split(/\s+/);
    const word = rest.join(" ").toLowerCase().trim();
    const settings = await getGroupSettings(ctx.chat);
    let words = settings.bannedWords;

    switch (action.toLowerCase()) {
      case "add":
        if (!word) break;
        words = [...new Set([...words, word])];
        await updateGroupSettings(ctx.chat, { bannedWords: words });
        await ctx.replyOk(`"${word}" is banned here.${isBotAdmin(await ctx.group()) ? "" : "\n_Make the bot admin so it can delete those messages._"}`);
        return;
      case "del":
      case "remove":
        if (!word) break;
        await updateGroupSettings(ctx.chat, { bannedWords: words.filter((item) => item !== word) });
        await ctx.replyOk(`"${word}" is allowed again.`);
        return;
      case "clear":
        await updateGroupSettings(ctx.chat, { bannedWords: [] });
        await ctx.replyOk("All banned words removed.");
        return;
      case "list":
        await ctx.reply(words.length ? `*Banned words*\n${words.map((item) => `• ${item}`).join("\n")}` : "*Banned words:* _(none)_");
        return;
    }
    await ctx.replyFail(`Usage: \`${config.prefix}antiword add <word> | del <word> | list | clear\``);
  },
});

command({
  name: "automute",
  aliases: ["autoclose"],
  description: "Close the group at the same time every day",
  category: "group",
  usage: "<time> | off",
  adminOnly: true,
  botAdmin: true,
  run: (ctx) => scheduleCommand(ctx, "close"),
});

command({
  name: "autounmute",
  aliases: ["autoopen"],
  description: "Open the group at the same time every day",
  category: "group",
  usage: "<time> | off",
  adminOnly: true,
  botAdmin: true,
  run: (ctx) => scheduleCommand(ctx, "open"),
});

command({
  name: "listmute",
  aliases: ["mutestatus"],
  description: "This group's daily open and close times",
  category: "group",
  groupOnly: true,
  run: async (ctx) => {
    const schedule = (await getSchedules())[ctx.chat];
    if (!schedule) {
      await ctx.reply(`No schedule. Set one with \`${config.prefix}automute 22:00\` and \`${config.prefix}autounmute 7:00\`.`);
      return;
    }
    await ctx.reply(
      `*Daily schedule* (${await getTimezone()})\n• Close: ${schedule.close ?? "–"}\n• Open: ${schedule.open ?? "–"}`,
    );
  },
});

command({
  name: "timezone",
  aliases: ["tz"],
  description: "Timezone for schedules and the auto bio",
  category: "owner",
  usage: "[Area/City, e.g. Africa/Lagos]",
  permission: "sudo",
  run: async (ctx) => {
    if (!ctx.args) {
      await ctx.reply(`*Timezone:* ${await getTimezone()}\n_Change it with \`${config.prefix}timezone Africa/Lagos\`._`);
      return;
    }
    try {
      await setTimezone(ctx.args.trim());
      await ctx.replyOk(`Timezone set to ${ctx.args.trim()}.`);
    } catch {
      await ctx.replyFail("Unknown timezone. Use a name like Africa/Lagos or Europe/London.");
    }
  },
});

command({
  name: "events",
  aliases: ["groupevents"],
  description: "Announce group changes (name, admins, settings)",
  category: "group",
  usage: "[on|off]",
  adminOnly: true,
  run: async (ctx) => {
    const enabled = nextValue(ctx.args, (await getGroupSettings(ctx.chat)).events);
    await updateGroupSettings(ctx.chat, { events: enabled });
    await ctx.replyOk(`Group event notices: ${onOff(enabled)}`);
  },
});

command({
  name: "captcha",
  aliases: ["verify"],
  description: "New members must send a code within 5 minutes",
  category: "group",
  usage: "[on|off]",
  adminOnly: true,
  botAdmin: true,
  run: async (ctx) => {
    const enabled = nextValue(ctx.args, (await getGroupSettings(ctx.chat)).captcha);
    await updateGroupSettings(ctx.chat, { captcha: enabled });
    await ctx.replyOk(`Captcha for new members: ${onOff(enabled)}`);
  },
});

