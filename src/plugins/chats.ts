import { send } from "../bot/client.ts";
import { config } from "../config.ts";
import { command } from "../core/command.ts";
import { MEDIA_TYPES } from "../core/message.ts";
import { isPrivileged } from "../features/access.ts";
import { reopenViewOnce } from "../features/automation.ts";
import { isBotAdmin, isGroupAdmin } from "../features/groups.ts";
import { userPart } from "../lib/jid.ts";
import { personFor, quotedKey } from "../lib/ctx.ts";
import { PIN_SECONDS } from "../lib/constants.ts";

command({
  name: "archive",
  description: "Archive this chat on the bot's account",
  category: "owner",
  permission: "sudo",
  run: async (ctx) => {
    await ctx.client.chat.setChatArchive(ctx.chat, true);
    await ctx.replyOk("Chat archived.");
  },
});

command({
  name: "unarchive",
  description: "Move this chat out of the archive",
  category: "owner",
  permission: "sudo",
  run: async (ctx) => {
    await ctx.client.chat.setChatArchive(ctx.chat, false);
    await ctx.replyOk("Chat unarchived.");
  },
});

command({
  name: "pin",
  description: "Pin the replied message, or pin this chat",
  category: "tools",
  usage: "(reply to a message) | chat",
  run: async (ctx) => {
    const key = quotedKey(ctx);
    if (key) {
      await send(ctx.chat, { type: "pin", target: key, durationSecs: PIN_SECONDS });
      await ctx.react("📌");
      return;
    }
    if (!(await isPrivileged(ctx))) {
      await ctx.replyFail("Reply to a message to pin it.");
      return;
    }
    await ctx.client.chat.setChatPin(ctx.chat, true);
    await ctx.replyOk("Chat pinned.");
  },
});

command({
  name: "unpin",
  description: "Unpin the replied message, or unpin this chat",
  category: "tools",
  usage: "(reply to a message) | chat",
  run: async (ctx) => {
    const key = quotedKey(ctx);
    if (key) {
      await send(ctx.chat, { type: "unpin", target: key });
      await ctx.react("✅");
      return;
    }
    if (!(await isPrivileged(ctx))) {
      await ctx.replyFail("Reply to a pinned message to unpin it.");
      return;
    }
    await ctx.client.chat.setChatPin(ctx.chat, false);
    await ctx.replyOk("Chat unpinned.");
  },
});

command({
  name: "block",
  description: "Block a contact on the bot's account",
  category: "owner",
  usage: "[@user | reply] (or use it in their DM)",
  permission: "sudo",
  audit: true,
  run: async (ctx) => {
    const target = personFor(ctx, "chat");
    if (!target) {
      await ctx.replyFail("Mention or reply to someone, or use this in their DM.");
      return;
    }
    await ctx.client.privacy.blockUser(target);
    await ctx.replyOk(`Blocked ${userPart(target)}.`);
  },
});

command({
  name: "unblock",
  description: "Unblock a contact",
  category: "owner",
  usage: "[@user | number]",
  permission: "sudo",
  audit: true,
  run: async (ctx) => {
    const target = personFor(ctx, "chat");
    if (!target) {
      await ctx.replyFail(`Usage: \`${config.prefix}unblock <number>\``);
      return;
    }
    await ctx.client.privacy.unblockUser(target);
    await ctx.replyOk(`Unblocked ${userPart(target)}.`);
  },
});

command({
  name: "blocklist",
  aliases: ["blocks"],
  description: "Contacts the bot's account has blocked",
  category: "owner",
  permission: "sudo",
  run: async (ctx) => {
    const result = await ctx.client.privacy.getBlocklist();
    const jids = result.jids ?? [];
    await ctx.reply(jids.length ? `*Blocked (${jids.length})*\n${jids.map((jid) => `• ${userPart(jid)}`).join("\n")}` : "*Blocked:* _(nobody)_");
  },
});

command({
  name: "clear",
  aliases: ["clearchat"],
  description: "Clear this chat on the bot's account",
  category: "owner",
  permission: "sudo",
  run: async (ctx) => {
    await ctx.client.chat.clearChat(ctx.chat);
    await ctx.replyOk("Chat cleared.");
  },
});

command({
  name: "delete",
  aliases: ["del", "dlt"],
  description: "Delete the replied message for everyone",
  category: "tools",
  usage: "(reply to a message)",
  run: async (ctx) => {
    const key = quotedKey(ctx);
    if (!key) {
      await ctx.replyFail("Reply to the message you want to delete.");
      return;
    }

    const privileged = await isPrivileged(ctx);
    if (!key.fromMe) {
      const group = ctx.isGroup ? await ctx.group() : null;
      const allowed = group && isBotAdmin(group) && (privileged || isGroupAdmin(group, ctx.senderIds));
      if (!allowed) {
        await ctx.replyFail(ctx.isGroup ? "Only admins can delete others' messages, and the bot must be admin." : "I can only delete my own messages here.");
        return;
      }
    } else if (!privileged && !(ctx.isGroup && isGroupAdmin(await ctx.group(), ctx.senderIds))) {
      await ctx.replyFail("Only admins can delete my messages.");
      return;
    }

    await send(ctx.chat, { type: "revoke", target: key });
  },
});

command({
  name: "vv",
  aliases: ["viewonce"],
  description: "Open a view-once photo, video or voice note (reply to it)",
  category: "owner",
  usage: "(reply to a view-once message)",
  permission: "sudo",
  run: async (ctx) => {
    const quoted = ctx.message.quoted;
    if (!quoted) {
      await ctx.replyFail("Reply to a view-once message.");
      return;
    }
    const opened = await reopenViewOnce(ctx.chat, quoted.content, quoted.text);
    if (!opened) await ctx.replyFail("That message has no photo, video or voice note.");
  },
});

command({
  name: "edit",
  aliases: ["editmsg"],
  description: "Edit one of the bot's messages (reply to it)",
  category: "owner",
  usage: "<new text> (reply to the bot's message)",
  permission: "sudo",
  run: async (ctx) => {
    const key = quotedKey(ctx);
    if (!key?.fromMe || !ctx.args) {
      await ctx.replyFail("Reply to one of my text messages with the new text.");
      return;
    }
    await send(ctx.chat, ctx.args, { editKey: { id: key.id, participant: key.participant } });
    await ctx.react("✏️");
  },
});

command({
  name: "say",
  aliases: ["send"],
  description: "Make the bot send a message here",
  category: "owner",
  usage: "<text>",
  permission: "sudo",
  run: async (ctx) => {
    if (!ctx.args) {
      await ctx.replyFail(`Usage: \`${config.prefix}say <text>\``);
      return;
    }
    await send(ctx.chat, { type: "text", text: ctx.args }, ctx.message.mentions.length ? { mentions: ctx.message.mentions } : undefined);
  },
});

command({
  name: "dlmsg",
  aliases: ["download"],
  description: "Send the replied media back as a file",
  category: "media",
  usage: "(reply to a photo, video, audio, sticker or document)",
  run: async (ctx) => {
    const quoted = ctx.message.quoted;
    if (!quoted || !MEDIA_TYPES.includes(quoted.type)) {
      await ctx.replyFail("Reply to a photo, video, audio, sticker or document.");
      return;
    }
    const media = await ctx.withTyping(() => ctx.downloadMedia());
    if (!media) {
      await ctx.replyFail("Could not download that media.");
      return;
    }
    const extension = media.mimetype.split("/")[1]?.split(";")[0] ?? "bin";
    await ctx.send({
      type: "document",
      media: media.bytes,
      mimetype: media.mimetype || "application/octet-stream",
      fileName: `${media.type}-${quoted.id || Date.now()}.${extension}`,
    });
  },
});
