import { proto, type WaSendMessageContent } from "zapo-js";
import { config } from "../config.ts";
import { botIdentity, send } from "../bot/client.ts";
import { command } from "../core/command.ts";
import type { Ctx } from "../core/context.ts";
import { kv } from "../db/kv.ts";
import { ownerNumbers } from "../features/access.ts";
import { normalizeId, phoneToJid } from "../lib/jid.ts";

const p = config.prefix;
const Font = proto.Message.ExtendedTextMessage.FontType;

const COLORS: Record<string, string> = {
  black: "#000000",
  purple: "#7f5af0",
  blue: "#1e88e5",
  teal: "#00897b",
  green: "#2cb67d",
  orange: "#f57c00",
  red: "#e53935",
  pink: "#d81b60",
  gray: "#546e7a",
};

const FONTS: Record<string, number> = {
  default: Font.SYSTEM,
  serif: Font.SYSTEM_TEXT,
  script: Font.FB_SCRIPT,
  bold: Font.SYSTEM_BOLD,
  breeze: Font.MORNINGBREEZE_REGULAR,
  calistoga: Font.CALISTOGA_REGULAR,
  exo: Font.EXO2_EXTRABOLD,
  courier: Font.COURIERPRIME_BOLD,
};

const USAGE =
  `*Post a status*\n` +
  `\`${p}story <text>\`\n` +
  `\`${p}story --color purple --font bold <text>\`\n` +
  `\`${p}story --to 234801...,234809... <text>\`\n` +
  `Reply to a photo or video with \`${p}story [caption]\`\n` +
  `\`${p}story undo\` deletes the last one\n\n` +
  `*Colors:* ${Object.keys(COLORS).join(", ")} or #RRGGBB\n` +
  `*Fonts:* ${Object.keys(FONTS).join(", ")}\n\n` +
  `_Without --to, the owners and the people in this chat see it._`;

interface StoryOptions {
  text: string;
  color: string | null;
  font: number | null;
  to: string[] | null;
}

function parseOptions(args: string): StoryOptions {
  const words = args.split(/(\s+)/);
  const options: StoryOptions = { text: "", color: null, font: null, to: null };

  let index = 0;
  while (index < words.length) {
    const word = words[index]!;
    if (!word.trim()) {
      index += 1;
      continue;
    }
    if (!word.startsWith("--")) break;

    const value = words[index + 2] ?? "";
    if (word === "--color") {
      options.color = value.toLowerCase();
      toArgb(options.color);
    }
    else if (word === "--font") options.font = FONTS[value.toLowerCase()] ?? null;
    else if (word === "--to") options.to = value.split(",").map((n) => n.replace(/\D/g, "")).filter(Boolean);
    else throw new Error(`Unknown option ${word}. Use --color, --font or --to.`);
    index += 3;
  }

  options.text = words.slice(index).join("").trim();
  return options;
}

function toArgb(color: string): number {
  const hex = (COLORS[color] ?? color).replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error(`Unknown color "${color}". Use a name or #RRGGBB.`);
  return (0xff000000 | parseInt(hex, 16)) >>> 0;
}

async function audience(ctx: Ctx, to: string[] | null): Promise<string[]> {
  const jids = new Set<string>();

  if (to) {
    to.forEach((number) => jids.add(phoneToJid(number)));
  } else {
    ownerNumbers().forEach((number) => jids.add(phoneToJid(number)));
    if (ctx.isGroup) {
      (await ctx.group()).participants.forEach((member) => jids.add(member.phoneNumber ?? member.jid));
    } else {
      jids.add(ctx.chat);
    }
  }

  const me = normalizeId(botIdentity().jid);
  return [...jids].filter((jid) => normalizeId(jid) !== me);
}

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
      await ctx.reply(USAGE);
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
          font: options.font ?? Font.SYSTEM,
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
    await ctx.replyOk(`Status posted to ${recipients.length} ${recipients.length === 1 ? "person" : "people"}. \`${p}story undo\` deletes it.`);
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
