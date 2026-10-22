import { type WaSendMessageContent } from "zapo-js";
import { config } from "../config.ts";
import { send } from "../bot/client.ts";
import { command } from "../core/command.ts";
import { kv } from "../db/kv.ts";
import { normalizeId, phoneToJid } from "../lib/jid.ts";
import { audience, DEFAULT_FONT, parseOptions, storyUsage, toArgb, type StoryOptions } from "../lib/status.ts";

command({
  name: "story",
  aliases: ["poststatus"],
  description: "Post a WhatsApp status",
  category: "owner",
  usage: "[--color c] [--font f] [--to numbers] <text> | undo",
  permission: "sudo",
  audit: true,
  run: async (ctx) => {
    if (ctx.args.toLowerCase() === "undo") {
      const last = await kv.get<{ id: string; recipients: string[] }>("last_story");
      if (!last) {
        await ctx.replyFail("No status to delete.");
        return;
      }
      await ctx.client.status.revokeStatus({ messageId: last.id, recipients: last.recipients });
      await kv.delete("last_story");
      await ctx.replyOk("Last status deleted.");
      return;
    }

    let options: StoryOptions;
    try {
      options = parseOptions(ctx.args);
    } catch (error) {
      await ctx.replyFail(error instanceof Error ? error.message : String(error));
      return;
    }

    const media = await ctx.downloadMedia();
    const hasMedia = media?.type === "image" || media?.type === "video";
    if (!hasMedia && !options.text) {
      await ctx.reply(storyUsage());
      return;
    }

    let content: WaSendMessageContent;
    if (media && hasMedia) {
      content =
        media.type === "image"
          ? { type: "image", media: media.bytes, mimetype: media.mimetype || "image/jpeg", caption: options.text }
          : { type: "video", media: media.bytes, mimetype: media.mimetype || "video/mp4", caption: options.text };
    } else {
      content = {
        extendedTextMessage: {
          text: options.text,
          backgroundArgb: toArgb(options.color ?? "purple"),
          textArgb: 0xffffffff,
          font: options.font ?? DEFAULT_FONT,
        },
      };
    }

    const recipients = await audience(ctx, options.to);
    if (recipients.length === 0) {
      await ctx.replyFail(`Nobody to show it to. Add \`--to <numbers>\`.`);
      return;
    }

    const result = await ctx.client.status.send({ content, recipients });
    await kv.set("last_story", { id: result.id, recipients });
    await ctx.replyOk(`Status posted to ${recipients.length} ${recipients.length === 1 ? "person" : "people"}. \`${config.prefix}story undo\` deletes it.`);
  },
});

command({
  name: "reqnum",
  aliases: ["requestnumber"],
  description: "Ask someone to share their phone number",
  category: "owner",
  usage: "[@user|number]",
  permission: "sudo",
  run: async (ctx) => {
    const typed = ctx.args.replace(/\D/g, "");
    const target = ctx.target() ?? (typed ? phoneToJid(typed) : ctx.chat);

    await send(target, { requestPhoneNumberMessage: {} });
    if (target !== ctx.chat) await ctx.replyOk(`Phone number request sent to @${normalizeId(target)}`, { mentions: [target] });
  },
});
