import sharp from "sharp";
import type { WaMessageKey } from "zapo-js";
import { config } from "../config.ts";
import { botIdentity, send } from "../bot/client.ts";
import { command } from "../core/command.ts";
import type { Ctx } from "../core/context.ts";
import { escapeXml } from "../lib/format.ts";
import { normalizeId, userPart } from "../lib/jid.ts";
import { runFfmpeg, tempPath, withTempFiles } from "../lib/media.ts";

async function demoImage(label: string): Promise<Uint8Array> {
  const svg = `
<svg width="640" height="640" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#7f5af0"/><stop offset="1" stop-color="#2cb67d"/>
  </linearGradient></defs>
  <rect width="640" height="640" fill="url(#g)"/>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-size="64" font-weight="700"
    fill="#ffffff" font-family="Arial, sans-serif">${escapeXml(label)}</text>
</svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer());
}

async function demoVideo(): Promise<Uint8Array> {
  return withTempFiles(async (track) => {
    const output = track(tempPath(".mp4"));
    await runFfmpeg([
      "-f", "lavfi", "-i", "testsrc2=size=480x480:rate=24",
      "-f", "lavfi", "-i", "sine=frequency=660",
      "-t", "3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
      "-shortest", "-movflags", "+faststart", output,
    ]);
    return new Uint8Array(await Bun.file(output).arrayBuffer());
  });
}

function quotedKey(ctx: Ctx): WaMessageKey | null {
  const quoted = ctx.message.quoted;
  if (!quoted?.id) return null;
  const me = botIdentity();
  const fromMe = [me.jid, me.lid].some((id) => id && normalizeId(id) === normalizeId(quoted.sender));
  return { remoteJid: ctx.chat, id: quoted.id, fromMe, participant: ctx.isGroup ? quoted.sender : undefined };
}

interface Demo {
  description: string;
  run: (ctx: Ctx) => Promise<void>;
}

const DEMOS: Record<string, Demo> = {
  event: {
    description: "Calendar event card people can RSVP to",
    run: async (ctx) => {
      await ctx.send({
        type: "event",
        name: "Asena demo meetup",
        description: "Tap Going / Not going below.",
        startTime: Math.floor(Date.now() / 1000) + 3_600, // in one hour (unix seconds)
        location: { latitude: 6.5244, longitude: 3.3792, name: "Lagos" },
        joinLink: "https://zapo.to",
        hasReminder: true,
        reminderOffsetSec: 600,
      });
    },
  },

  countdown: {
    description: "One message edited in place, 5 to 0",
    run: async (ctx) => {
      const id = await send(ctx.chat, "5");
      for (let n = 4; n >= 0; n--) {
        await Bun.sleep(1_000);
        const text = n === 0 ? "Done." : String(n);
        // editKey points at the message to change. It must be one the bot sent.
        await send(ctx.chat, text, { editKey: { remoteJid: ctx.chat, id, fromMe: true } });
      }
    },
  },

  pin: {
    description: "Pin a message for 24h (reply to one, or pins a new one)",
    run: async (ctx) => {
      const target = quotedKey(ctx) ?? { remoteJid: ctx.chat, id: await send(ctx.chat, "This message is pinned"), fromMe: true };
      await send(ctx.chat, { type: "pin", target, durationSecs: 86_400 });
    },
  },

  viewonce: {
    description: "Photo that can be opened only once (reply to a photo, or uses a test picture)",
    run: async (ctx) => {
      const media = await ctx.downloadMedia();
      const isPhoto = media?.type === "image";
      await ctx.send(
        {
          type: "image",
          media: isPhoto ? media.bytes : await demoImage("View once"),
          mimetype: isPhoto ? media.mimetype || "image/jpeg" : "image/jpeg",
          caption: "Open me once",
        },
        { viewOnce: true },
      );
    },
  },

  ptv: {
    description: "Round video bubble (reply to a video, or uses a test video)",
    run: async (ctx) => {
      const media = await ctx.downloadMedia();
      const bytes = media?.type === "video" ? media.bytes : await demoVideo();
      // "ptv" = push-to-video: the round video note you record by holding the camera button.
      await ctx.send({ type: "ptv", media: bytes, mimetype: "video/mp4" });
    },
  },

  voice: {
    description: "Show 'recording audio…' for 3 seconds",
    run: async (ctx) => {
      // "Recording audio…" is the typing state plus media: "audio".
      await ctx.client.presence.sendChatstate(ctx.chat, { state: "composing", media: "audio" });
      await Bun.sleep(3_000);
      await ctx.client.presence.sendChatstate(ctx.chat, { state: "paused" });
      await ctx.reply("That was the recording indicator.");
    },
  },

  location: {
    description: "Location pin",
    run: async (ctx) => {
      await ctx.send({
        locationMessage: { degreesLatitude: 6.4541, degreesLongitude: 3.3947, name: "Lagos Island", address: "Lagos, Nigeria" },
      });
    },
  },

  live: {
    description: "Live-location style card",
    run: async (ctx) => {
      await ctx.send({
        liveLocationMessage: { degreesLatitude: 6.5244, degreesLongitude: 3.3792, accuracyInMeters: 20, caption: "On my way", sequenceNumber: 1 },
      });
    },
  },

  contact: {
    description: "Contact card (vCard) of the sender",
    run: async (ctx) => {
      const phone = userPart(ctx.sender);
      const vcard = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${ctx.pushName || phone}`,
        // waid links the card to the WhatsApp account, so "Message" works.
        `TEL;type=CELL;type=VOICE;waid=${phone}:+${phone}`,
        "END:VCARD",
      ].join("\n");
      await ctx.send({ contactMessage: { displayName: ctx.pushName || phone, vcard } });
    },
  },

  link: {
    description: "Link with a custom preview card",
    run: async (ctx) => {
      await ctx.send({
        type: "text",
        text: "Docs: https://zapo.to",
        linkPreview: { title: "zapo · WhatsApp for TypeScript", description: "Custom preview set by the bot" },
      });
    },
  },

  react: {
    description: "React to your message with a few emojis in a row",
    run: async (ctx) => {
      for (const emoji of ["👀", "🤔", "💡", "🔥"]) {
        await ctx.react(emoji);
        await Bun.sleep(800);
      }
    },
  },

  poll: {
    description: "Poll where people can pick several options",
    run: async (ctx) => {
      await ctx.send({ type: "poll", name: "Which demo was best?", options: ["event", "countdown", "ptv", "viewonce"], selectableCount: 4 });
    },
  },

  list: {
    description: "List menu (may not show on normal accounts)",
    run: async (ctx) => {
      const { proto } = await import("zapo-js");
      await ctx.send({
        listMessage: {
          title: "Asena menu",
          description: "WhatsApp often hides list menus from non-business accounts.",
          buttonText: "Open",
          listType: proto.Message.ListMessage.ListType.SINGLE_SELECT,
          sections: [{ title: "Demos", rows: [{ rowId: "event", title: "Event" }, { rowId: "ptv", title: "Round video" }] }],
        },
      });
    },
  },
};

command({
  name: "demo",
  description: "Try unusual message types",
  category: "misc",
  usage: "<type>",
  run: async (ctx) => {
    const name = ctx.args.toLowerCase().split(/\s+/)[0] ?? "";
    const demo = DEMOS[name];

    if (!demo) {
      const lines = Object.entries(DEMOS).map(([key, value]) => `▸ *${key}* — ${value.description}`);
      await ctx.reply(`*Message demos*\nUse \`${config.prefix}demo <type>\`\n\n${lines.join("\n")}`);
      return;
    }

    await demo.run(ctx);
  },
});
