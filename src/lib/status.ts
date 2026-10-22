import { proto } from "zapo-js";
import { botIdentity } from "../bot/client.ts";
import { config } from "../config.ts";
import type { Ctx } from "../core/context.ts";
import { ownerNumbers } from "../features/access.ts";
import { normalizeId, phoneToJid } from "./jid.ts";

const Font = proto.Message.ExtendedTextMessage.FontType;

export const DEFAULT_FONT = Font.SYSTEM;

export const COLORS: Record<string, string> = {
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

export const FONTS: Record<string, number> = {
  default: Font.SYSTEM,
  serif: Font.SYSTEM_TEXT,
  script: Font.FB_SCRIPT,
  bold: Font.SYSTEM_BOLD,
  breeze: Font.MORNINGBREEZE_REGULAR,
  calistoga: Font.CALISTOGA_REGULAR,
  exo: Font.EXO2_EXTRABOLD,
  courier: Font.COURIERPRIME_BOLD,
};

export function storyUsage(): string {
  return (
      `*Post a status*\n` +
  `\`${config.prefix}story <text>\`\n` +
  `\`${config.prefix}story --color purple --font bold <text>\`\n` +
  `\`${config.prefix}story --to 234801...,234809... <text>\`\n` +
  `Reply to a photo or video with \`${config.prefix}story [caption]\`\n` +
  `\`${config.prefix}story undo\` deletes the last one\n\n` +
  `*Colors:* ${Object.keys(COLORS).join(", ")} or #RRGGBB\n` +
  `*Fonts:* ${Object.keys(FONTS).join(", ")}\n\n` +
  `_Without --to, the owners and the people in this chat see it._`
  );
}

export interface StoryOptions {
  text: string;
  color: string | null;
  font: number | null;
  to: string[] | null;
}

export function parseOptions(args: string): StoryOptions {
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

export function toArgb(color: string): number {
  const hex = (COLORS[color] ?? color).replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error(`Unknown color "${color}". Use a name or #RRGGBB.`);
  return (0xff000000 | parseInt(hex, 16)) >>> 0;
}

export async function audience(ctx: Ctx, to: string[] | null): Promise<string[]> {
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
