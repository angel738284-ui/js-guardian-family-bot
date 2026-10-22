import { rm } from "node:fs/promises";
import { config } from "../config.ts";
import { command } from "../core/command.ts";
import { calls } from "../features/calls.ts";
import { phoneToJid, userPart } from "../lib/jid.ts";
import { tempPath } from "../lib/media.ts";
import { personFor } from "../lib/ctx.ts";
import { REPO_URL } from "../lib/constants.ts";

command({
  name: "whois",
  aliases: ["userinfo"],
  description: "Profile photo, about and business details of someone",
  category: "tools",
  usage: "[@user | reply | number]",
  run: async (ctx) => {
    const jid = personFor(ctx, "sender")!;
    const [picture, about, business] = await ctx.withTyping(() =>
      Promise.all([
        ctx.client.profile.getProfilePicture(jid, "image").catch(() => null),
        ctx.client.profile.getAboutStatus(jid).catch(() => null),
        ctx.client.business.getBusinessProfile([jid]).then((items) => items[0] ?? null).catch(() => null),
      ]),
    );

    const lines = [`*Who is ${userPart(jid)}*`, `• Number: +${userPart(jid)}`, `• About: ${about || "_hidden or empty_"}`];
    if (business?.description || business?.categories?.length) {
      lines.push(`• Business: ${business.categories?.map((item) => item.name).join(", ") || "yes"}`);
    }
    const caption = lines.join("\n");

    if (picture?.url) {
      const response = await fetch(picture.url).catch(() => null);
      if (response?.ok) {
        await ctx.send({ type: "image", media: new Uint8Array(await response.arrayBuffer()), mimetype: "image/jpeg", caption });
        return;
      }
    }
    await ctx.reply(`${caption}\n• Photo: _hidden or none_`);
  },
});

command({
  name: "business",
  aliases: ["biz"],
  description: "Business profile of a WhatsApp Business account",
  category: "tools",
  usage: "[@user | reply | number]",
  run: async (ctx) => {
    const jid = personFor(ctx, "sender")!;
    const profile = (await ctx.client.business.getBusinessProfile([jid]).catch(() => []))[0];
    if (!profile || (!profile.description && !profile.categories?.length && !profile.email && !profile.websites?.length)) {
      await ctx.reply(`${userPart(jid)} is not a business account, or has no public details.`);
      return;
    }

    const lines = [`*Business profile* · +${userPart(jid)}`];
    if (profile.categories?.length) lines.push(`• Category: ${profile.categories.map((item) => item.name).join(", ")}`);
    if (profile.description) lines.push(`• About: ${profile.description}`);
    if (profile.address) lines.push(`• Address: ${profile.address}`);
    if (profile.email) lines.push(`• Email: ${profile.email}`);
    if (profile.websites?.length) lines.push(`• Website: ${profile.websites.map((site) => site.url).join(", ")}`);
    await ctx.reply(lines.join("\n"));
  },
});

command({
  name: "contact",
  aliases: ["savecontact"],
  description: "Send a contact card",
  category: "tools",
  usage: "<number> [name] | @user [name]",
  run: async (ctx) => {
    const jid = personFor(ctx);
    if (!jid) {
      await ctx.replyFail(`Usage: \`${config.prefix}contact 2348012345678 Ade\``);
      return;
    }
    const phone = userPart(jid);
    const name = ctx.args.replace(/@?\+?\d[\d\s-]{5,}/, "").trim() || `+${phone}`;
    const vcard = ["BEGIN:VCARD", "VERSION:3.0", `FN:${name}`, `TEL;type=CELL;type=VOICE;waid=${phone}:+${phone}`, "END:VCARD"].join("\n");
    await ctx.send({ contactMessage: { displayName: name, vcard } });
  },
});

command({
  name: "call",
  description: "Ring someone; reply to an audio to play it when they answer",
  category: "tools",
  usage: "<@user | reply | number>",
  permission: "sudo",
  audit: true,
  run: async (ctx) => {
    if (!calls.enabled()) {
      await ctx.replyFail("Calls are not available on this bot.");
      return;
    }
    const jid = ctx.message.mentions[0] ?? (ctx.args.replace(/\D/g, "").length >= 7 ? phoneToJid(ctx.args) : null) ?? ctx.message.quoted?.sender ?? null;
    if (!jid) {
      await ctx.replyFail(`Usage: \`${config.prefix}call 2348012345678\``);
      return;
    }

    const quoted = ctx.message.quoted;
    if (quoted?.type === "audio") {
      const file = tempPath(".ogg");
      try {
        await Bun.write(file, await ctx.client.message.downloadBytes(quoted.content));
        await ctx.reply(`📞 Calling ${userPart(jid)}…`);
        const result = await calls.ring(jid, file);
        await ctx.reply(result.answered ? `✓ They answered and heard the audio (${result.seconds ?? 0}s).` : `✕ No answer (${result.reason}).`);
      } finally {
        await rm(file, { force: true });
      }
      return;
    }

    await ctx.reply(`📞 Calling ${userPart(jid)}…`);
    const outcome = await calls.alert(jid, { attempts: 1 });
    await ctx.reply(outcome === "answered" ? "✓ They picked up." : outcome === "declined" ? "✕ They declined." : "✕ No answer.");
  },
});

command({
  name: "repo",
  aliases: ["sc", "source"],
  description: "Where to find the bot's source code",
  category: "system",
  run: async (ctx) => {
    await ctx.reply(`*${config.botName}* v${config.version}\nOpen source on GitHub:\n${REPO_URL}\n\n_Star it if you like it ⭐_`);
  },
});
