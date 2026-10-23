# Asena

An open-source WhatsApp bot written in **TypeScript** for **[Bun](https://bun.sh)**, built on **[zapo](https://zapo.to)**.

Asena keeps its data in SQLite (or Postgres), uses a private **system log group** for setup and error details, and comes with moderation, media, productivity and admin tools.

| | |
|---|---|
| **Runtime** | Bun ≥ 1.4 |
| **Language** | TypeScript (strict), run directly by Bun with no build step |
| **WhatsApp library** | [zapo-js](https://www.npmjs.com/package/zapo-js) |
| **Storage** | SQLite in `./data` (default), Postgres, Redis or MongoDB; or the Asena server with a session ID |
| **Prefix** | `#` (change it with `PREFIX`) |

> Asena 1.0 is a rewrite of X-Asena 4 (Node + Baileys). See [Upgrading from X-Asena](#upgrading-from-x-asena).

---

## Features

- **Commands**: one simple `command({...})` call per command, with built-in permission, group and admin checks
- **Media**: stickers with pack info, YouTube audio and video (no `yt-dlp`), MP3 conversion, text-to-speech, text stickers, social downloaders (best effort)
- **Moderation**: welcome and goodbye messages, anti-link, anti-spam, warn, mute, kick, per-group command switches
- **Productivity**: notes, reminders, polls
- **Setup**: an automatically created system group and a `#setup` wizard
- **Operations**: audit log, feature flags, global policies, job queue, metrics with error alerts, backups, and an optional admin HTTP API

---

## Requirements

- [Bun](https://bun.sh) **1.4 or newer**
- **FFmpeg** on your `PATH` for `#ytmp3`, `#ytmp4`, `#tomp3`, video stickers, `#attp` and voice notes
- A WhatsApp account to link the bot to (like WhatsApp Web)

```bash
curl -fsSL https://bun.sh/install | bash   # Bun (macOS / Linux)
brew install ffmpeg                          # macOS
sudo apt install ffmpeg                      # Debian / Ubuntu
choco install ffmpeg                         # Windows
```

---

## Install and run

```bash
git clone https://github.com/shellhaki/asena.git
cd asena
bun install
cp .env.example .env      # then set OWNER_NUMBER
bun start
```

During development, `bun dev` restarts the bot when a file changes.

### Linking WhatsApp

There are two ways to link the bot's WhatsApp account.

**On the website (recommended):** open [asena.fun/pair](https://asena.fun/pair), scan the QR code or enter a pairing code, and copy the session ID you get. Put it in `.env`:

```env
SESSION_ID=ASENA_...
```

On `bun start` the bot loads its login and settings from the Asena server, works on a local copy, and uploads changes every 20 seconds and on shutdown. Everything is encrypted with your session ID; the server keeps only a hash of the ID, so it cannot read your data. You can move the bot to another machine with nothing but the session ID. Bots linked this way also count towards the public [stats page](https://asena.fun/stats).

**On Render (free hosting):** create the bot in the [dashboard](https://app.asena.fun), click *Deploy to Render*, and paste the session ID. The dashboard adds a keep-alive job so the free plan does not put the bot to sleep. Full guide: [Deploy on Render](https://asena.fun/docs/deploy-render).

**In the dashboard:** [app.asena.fun](https://app.asena.fun) (sign in with GitHub or Google) names your bots, shows live message and command counts, runs keep-alive pings, and lets you **refresh a session** after a logout without losing the bot's history. See [Dashboard](https://asena.fun/docs/dashboard).

**In the terminal (fully local):** leave `SESSION_ID` empty and the bot prints a QR code itself. Nothing is sent to the pairing server.

- **QR code (default):** scan the QR code shown in the terminal. On your phone, go to *WhatsApp → Linked devices → Link a device*.
- **Pairing code:** set `PAIRING_NUMBER` to your number with country code (digits only, e.g. `919876543210`). Restart, then enter the 8-character code under *Linked devices → Link with phone number instead*.

The login is saved in `data/session.db`, so later starts need no QR code. If you log the bot out from your phone, Asena clears the old login and shows a new QR code.

---

## Configuration

All settings live in `.env`. Bun loads it automatically.

| Variable | Default | Description |
|----------|---------|-------------|
| `OWNER_NUMBER` | _(empty)_ | Owner phone number(s), comma-separated, with country code and no `+`. Needed for the system group. |
| `SUDO` | _(empty)_ | Extra trusted numbers. You can also add them later with `#sudo`. |
| `PREFIX` | `#` | Command prefix |
| `BOT_MODE` | `public` | Start mode, used only on first start: `public` or `private` |
| `BOT_LANG` | `en` | Start language: `en`, `id` or `hi` |
| `AUTH_DB` | `sqlite` | Where the WhatsApp login is stored: `sqlite`, `postgres`, `redis` or `mongodb`. With `postgres`, bot settings go there too; otherwise they stay in `data/bot.db`. Ignored with `SESSION_ID`. |
| `AUTH_DB_URL` | _(empty)_ | Connection URL for `postgres`, `redis` or `mongodb` (add `?sslmode=require` for hosted Postgres) |
| `DATABASE_URL` | _(empty)_ | Old name for `AUTH_DB_URL`. A `postgres://` URL here still selects Postgres. |
| `DATA_DIR` | `./data` | Folder for the SQLite files |
| `SESSION_ID` | _(empty)_ | Session ID from [asena.fun/pair](https://asena.fun/pair). When set, the login and settings are stored on the Asena server, encrypted with this ID. |
| `ASENA_SERVER` | `https://api.asena.fun` | Server used with `SESSION_ID` (change it if you run your own) |
| `SESSION_SYNC_SECONDS` | `20` | How often a `SESSION_ID` bot uploads changes |
| `SESSION_HEARTBEAT_SECONDS` | `30` | How often a `SESSION_ID` bot reports metrics to the dashboard |
| `PORT` | _(empty)_ | Answer HTTP on this port (`/health`), so hosts like Render see the bot as up and keep-alive jobs can wake it. Render sets it for you. |
| `PUBLIC_URL` | `RENDER_EXTERNAL_URL` | The bot's public address, shown in the dashboard to suggest a keep-alive job |
| `PAIRING_NUMBER` | _(empty)_ | Use a pairing code in the terminal instead of a QR code |
| `STICKER_PACKNAME` / `STICKER_AUTHOR` | `Asena` | Default sticker pack info |
| `AI_URL` / `AI_KEY` | _(empty)_ | Natural-language AI for bots without `SESSION_ID`. [DM me](https://wa.me/shellhakii) for a key. Not needed with `SESSION_ID` or on Render (see [AI](#ai)). |
| `AI_NAME` | `Asena` | Name that calls the AI in groups, e.g. "Asena, make this a sticker" |
| `YT_COOKIE` | _(empty)_ | YouTube cookie for `#song` / `#video` on servers. Easier: run `#ytlogin` once. |
| `REMOVEBG_API_KEY` | _(empty)_ | API key for `#removebg` |
| `ENABLE_EVAL` | `false` | Turn on `#eval` (owner numbers only). See [Testing with #eval](#testing-with-eval). |
| `LOG_LEVEL` | `info` | Bot logs: `error`, `warn`, `info` or `debug` |
| `ZAPO_LOG_LEVEL` | `error` | zapo logs: `trace`, `debug`, `info`, `warn` or `error` |
| `JOB_CONCURRENCY` | `1` | How many heavy media jobs (YouTube) run at the same time |
| `ERROR_ALERT_THRESHOLD` | `8` | Errors per minute before an alert goes to the system group |
| `TENANT_ID` | `default` | Label used in metrics and backups |
| `ADMIN_HTTP_PORT` / `ADMIN_HTTP_HOST` / `ADMIN_HTTP_TOKEN` | off / `127.0.0.1` / _(required)_ | Optional admin HTTP API |

### Storage

| `AUTH_DB` | WhatsApp login | Bot settings |
|---|---|---|
| `sqlite` (default) | `data/session.db` | `data/bot.db` |
| `postgres` | `zapo_*` tables | `bot_kv` table |
| `redis` | `asena:*` keys | `data/bot.db` |
| `mongodb` | collections in the URL's database (default `asena`) | `data/bot.db` |
| any, with `SESSION_ID` | Asena server, encrypted (local working copy in `data/`) | same |

SQLite and Postgres use drivers that ship with Bun, so nothing needs to be compiled. With Redis, turn on persistence (AOF or RDB) and do not use an eviction policy, or the login can disappear.

---

## AI

With the AI on, people can talk to the bot instead of typing commands. The AI ([Meta Muse](https://dev.meta.ai)) runs on the Asena utils server (`asena-server/utils`) and knows every command the bot has, so each new command is also something the AI can do. When nothing fits, it says the feature is not available yet.

### Turning it on

| How you run the bot | What to do |
|---|---|
| With a `SESSION_ID` (from [asena.fun/pair](https://asena.fun/pair), including every Render deploy) | **Nothing.** The AI works out of the box, with a daily limit. |
| Without a `SESSION_ID` (local login with a QR code in the terminal) | **[DM me on WhatsApp](https://wa.me/shellhakii)** for an AI key, then add both lines to `.env` and restart. |

```env
AI_URL=https://utils.asena.fun
AI_KEY=your-key-here
```

### How it behaves

- **Private chats:** any message that is not a command.
- **Groups:** when someone mentions the bot, replies to it, or writes its name (`AI_NAME`).
- It sees recent messages in the chat, can search older ones ("send the last image Ade posted again"), run commands on them ("make that a sticker"), and remember facts.
- Permissions still apply: the AI runs commands as the person who asked.
- `#ai off` turns it off in one chat (admins in groups); `#flag ai off` turns it off everywhere.

To do this, the bot uploads the chat messages it sees (text, and media keys for re-sending) to the utils server, which deletes them after `MESSAGE_RETENTION_DAYS`.

---

## First run

1. Set `OWNER_NUMBER` and start the bot.
2. After it connects, Asena creates a group called **`Asena · System`** with you in it.
3. In that group, run `#setup`. The wizard asks for the mode, language and sticker pack.
4. In normal groups, admins can run `#groupsetup recommended`.

If the group cannot be created automatically, create a group yourself, add the bot, and run `#setlog` there.

**Why a system group?** Setup steps, error details and alerts stay in one private place. Other chats only ever see short, friendly messages.

---

## Commands

Run `#menu` for the full list, or `#help <command>` for details about one command.

### General

| Command | Description |
|---------|-------------|
| `#menu` (also `#list`), `#help <command>` | Command list and details |
| `#ping` | Check that the bot answers, with response time |
| `#info` | Details about the chat and message |
| `#status` | Uptime, mode and FFmpeg check (more details for owner and sudo) |
| `#lang [en\|id\|hi]` | Show the language. Owner and sudo can change it. |

### Access (owner and sudo)

| Command | Description |
|---------|-------------|
| `#mode public\|private` | **public**: anyone can use commands. **private**: only owner and sudo; others are ignored. |
| `#sudo list\|add\|del` | Manage trusted users (only the owner can add or remove) |

### Groups

| Command | Who | Description |
|---------|-----|-------------|
| `#groupinfo`, `#admins` | everyone | Group details |
| `#warns [@user]` | everyone | Show warnings |
| `#disabled` | everyone | Commands switched off in this group |
| `#mention [text]` (also `#notify`) | admins | Notify every member |
| `#tagall` | owner, sudo | Tag every member in a numbered list |
| `#promote`, `#demote` | admins | Change admin rights |
| `#gcall`, `#gcall end` | admins | Start a group voice call that rings every member; the bot stays (silent) until everyone leaves. `end` takes the bot off. Needs calls installed |
| `#invite [@user\|number]` | admins | Invite card for this group. Plain `#invite` posts it here; with a person, sends it to them privately. The bot must be admin. |

### Moderation (group admins)

| Command | Description |
|---------|-------------|
| `#groupsetup recommended\|minimal\|off` | Apply a preset |
| `#welcome`, `#goodbye` | Turn on or off, or set the text (`@user`, `@group`, `@count`) |
| `#antilink`, `#antispam` | Delete links or spam (the bot must be admin) |
| `#groupsettings` | Show this group's settings |
| `#warn`, `#unwarn` | Warn a member; they are removed at the warn limit |
| `#mute`, `#unmute`, `#kick` | Mute or remove a member |
| `#disable <cmd>`, `#enable <cmd>` | Switch a command off or on in this group |

Moderation commands work on the member you **@mention** or **reply to**.

### Stickers and media

| Command | Description |
|---------|-------------|
| `#sticker` (also `#s`) | Image or short video to sticker |
| `#take Pack\|Author` (also `#steal`) | Re-label a sticker |
| `#toimg` | Sticker to image |
| `#exif Pack\|Author` | Default sticker pack info (owner and sudo) |
| `#yt`, `#ytmp3` (also `#play`), `#ytmp4` | YouTube details, audio, and video up to 720p |
| `#tomp3` | Video or audio to MP3 |
| `#tourl` (also `#url`) | Upload media and get a link |
| `#quote`, `#ttp`, `#attp` | Quote sticker, text sticker, animated text sticker |
| `#fancy`, `#tts [lang:] text` | Fancy text styles, text to speech |
| `#removebg` | Remove an image background (needs `REMOVEBG_API_KEY`) |
| `#tiktok` (also `#tt`), `#ig` (also `#insta`), `#fb` | Social downloads (best effort; these sites block bots often) |

YouTube limits: about 15 minutes for audio and 10 minutes for video. Downloads wait in a queue (`JOB_CONCURRENCY`).

### Productivity

| Command | Description |
|---------|-------------|
| `#note set\|get\|del\|list` | Personal notes |
| `#remind 10m <text>` | Reminder in this chat (`30s`, `10m`, `2h`, `1d`) |
| `#remind call 10m <text>` | Same, and the bot also calls you, up to 3 times until you pick up or decline (needs calls installed) |
| `#reminders`, `#cancelremind <id>` | List or cancel reminders |
| `#poll Question \| A \| B` | Create a poll |

### System and operations

Most of these work best in the system group.

| Command | Description |
|---------|-------------|
| `#setup`, `#createlog`, `#setlog` | Setup wizard and the system group |
| `#audit [action] [count]` | Recent sensitive actions (system group only) |
| `#flag list`, `#flag <name> on\|off` | Global feature switches: `media`, `ytdl`, `social`, `stickers`, `moderation`, `broadcast`, `maintenance` |
| `#policy list`, `#policy <name> <value>` | Rules for normal users: `quietHoursStart`, `quietHoursEnd`, `rateLimitPerUser`, `allowMediaCommands`, `blockBroadcast` |
| `#backup`, `#backup full` | Export settings (`full` also sends the login database, only in the system group) |
| `#metrics` | Runtime counters and the job queue |
| `#broadcast <text>` | Send a message to every group (owner) |
| `#story [options] <text>` (also `#poststatus`) | Post a WhatsApp status. Options: `--color purple\|#RRGGBB`, `--font bold\|serif\|script\|...`, `--to 234801...,234809...`. Reply to a photo or video to post it. `#story undo` deletes the last one. Without `--to`, the owners and the people in the current chat see it. |
| `#reqnum [@user\|number]` | Ask someone (or this chat) to share their phone number |
| `#cmdlist` | Every command name, including hidden ones |
| `#eval <code>` (also `#>`) | Run TypeScript inside the bot. Owner numbers only, needs `ENABLE_EVAL=true` |

### Admin HTTP API (optional)

Set `ADMIN_HTTP_PORT` and `ADMIN_HTTP_TOKEN`, then call the endpoints with `Authorization: Bearer <token>`.

| Endpoint | Token | Description |
|----------|-------|-------------|
| `GET /health` | no | Connection, mode, setup and queue status |
| `GET /metrics` | yes | JSON metrics (`?format=prom` for Prometheus) |
| `GET /audit?limit=50&action=kick` | yes | Audit entries |
| `GET /flags`, `GET /policies` | yes | Current flags and policies |

---

## Writing a command

Every `.ts` file in `src/plugins/` is loaded at start. To add a command, create a file:

```ts
// src/plugins/hello.ts
import { command } from "../core/command.ts";

command({
  name: "hello",
  description: "Say hello",
  category: "misc",
  run: async (ctx) => {
    await ctx.reply(`Hello, ${ctx.pushName || "friend"}!`);
  },
});
```

The `ctx` object has everything a command needs:

| | |
|---|---|
| `ctx.args` | Text after the command (`#hello there` → `"there"`) |
| `ctx.chat`, `ctx.sender`, `ctx.isGroup` | Where the message came from, and who sent it |
| `ctx.message.quoted` | The message being replied to, if any |
| `ctx.reply(text)`, `ctx.replyOk(text)`, `ctx.replyFail(text)` | Reply in the chat |
| `ctx.send({ type: "image", media, mimetype })` | Send any [zapo content](https://zapo.to/en/reference/message-types) |
| `ctx.downloadMedia()` | Media from the message, or from the message it replies to |
| `ctx.target()` | The @mentioned or replied-to user |
| `ctx.group()` | Group details (cached) |
| `ctx.withTyping(fn)` | Show "typing..." while `fn` runs |

Rules are options on the command, and the handler checks them before `run` is called:

```ts
command({
  name: "kick",
  description: "Remove a member",
  category: "admin",
  adminOnly: true,   // only group admins (implies groupOnly)
  botAdmin: true,    // the bot must be an admin too
  flag: "moderation",// #flag moderation off turns it off everywhere
  audit: true,       // record every use in the audit log
  run: async (ctx) => { /* ... */ },
});
```

Other options: `aliases`, `usage`, `permission: "sudo" | "owner"`, `groupOnly`, `hidden`.

---

## Using zapo: a practical guide

[zapo](https://zapo.to) is the library that talks to WhatsApp. Everything goes through one object, the **client**, which is split into topic areas:

| Area | What it does |
|---|---|
| `client.message` | Send, edit, delete, react, download media |
| `client.group` | Group info, members, admins, settings, invites |
| `client.profile` | Profile pictures, about text, name, "is this number on WhatsApp?" |
| `client.privacy` | Block and unblock, privacy settings |
| `client.presence` | Online status, "typing…", "recording…" |
| `client.chat` | Mute, pin, archive, mark read, star (on your own devices) |
| `client.status` | Post status updates (stories) |
| `client.newsletter` | WhatsApp channels |
| `client.bot` | Talk to Meta AI and other WhatsApp bots |

**Where to get `client`:**
- Inside a command: `ctx.client`. The current chat is `ctx.chat`.
- In `#eval`: `client` and `chat` are ready to use (see [Testing with #eval](#testing-with-eval)).

In the examples below, `jid` means a chat ID (see the next section) and every call uses `await`.

### WhatsApp IDs ("JIDs")

| Kind | Looks like |
|---|---|
| Person (phone) | `2348012345678@s.whatsapp.net` |
| Person (private ID, "LID") | `123456789012345@lid` |
| Group | `120363012345678901@g.us` |
| Channel | `120363012345678901@newsletter` |

In a private chat, `client.message.send` also accepts just the digits: `"2348012345678"`. Groups increasingly show members by LID instead of phone number. Both work for sending.

```ts
import { isGroupJid, isLidJid, toUserJid } from "zapo-js";

isGroupJid(jid);                         // true for groups
toUserJid("2348012345678:5@s.whatsapp.net"); // "2348012345678@s.whatsapp.net" (drops the device)
```

### Sending messages

Everything is sent with **`client.message.send(to, content, options?)`**. `content` is a string, or an object with a `type`.

```ts
// Text
await client.message.send(jid, "Hello!");

// Reply to a message (shows the quoted bubble). `event` is an incoming message (ctx.event in a command).
await client.message.send(jid, "Got it", { quote: event });

// Mention people: put @number in the text AND list the IDs
await client.message.send(jid, "Hi @2348012345678", { mentions: ["2348012345678@s.whatsapp.net"] });

// Mark as forwarded
await client.message.send(jid, "Breaking news", { forward: true });

// Disappears after 24 hours
await client.message.send(jid, "Secret", { expirationSeconds: 86_400 });
```

`send` returns `{ id }`, the new message ID. You need it to edit, delete or pin that message.

**Edit, delete, react:**

```ts
const { id } = await client.message.send(jid, "Typo hre");

// Edit (only your own messages)
await client.message.send(jid, "Typo here", { editKey: { remoteJid: jid, id, fromMe: true } });

// Delete for everyone
await client.message.send(jid, { type: "revoke", target: { remoteJid: jid, id, fromMe: true } });

// React (empty emoji removes the reaction). `target` can be an incoming event or a key like above.
await client.message.send(jid, { type: "reaction", emoji: "🔥", target: event });
```

To delete someone else's message in a group, the bot must be admin: use `{ remoteJid: groupJid, id, fromMe: false, participant: authorJid }` as the target.

### Sending media

`media` can be a **file path**, a **`Uint8Array`** (bytes), or a stream. File paths are best for big files.

```ts
// Image
await client.message.send(jid, { type: "image", media: "./photo.jpg", mimetype: "image/jpeg", caption: "Look!" });

// Video (and GIF-style looping video)
await client.message.send(jid, { type: "video", media: "./clip.mp4", mimetype: "video/mp4", caption: "Watch" });
await client.message.send(jid, { type: "video", media: "./loop.mp4", mimetype: "video/mp4", gifPlayback: true });

// Music / audio file
await client.message.send(jid, { type: "audio", media: "./song.mp3", mimetype: "audio/mpeg" });

// Voice note (the blue microphone kind). zapo converts it to the right format.
await client.message.send(jid, { type: "audio", media: "./voice.mp3", mimetype: "audio/mpeg", ptt: true });

// Document (any file)
await client.message.send(jid, {
  type: "document", media: "./report.pdf", mimetype: "application/pdf", fileName: "Report.pdf", caption: "Q3",
});

// Sticker (WebP, 512x512)
await client.message.send(jid, { type: "sticker", media: "./sticker.webp" });

// Round video note
await client.message.send(jid, { type: "ptv", media: "./clip.mp4", mimetype: "video/mp4" });

// View once (images, videos, audio)
await client.message.send(jid, { type: "image", media: "./secret.jpg", mimetype: "image/jpeg" }, { viewOnce: true });
```

**From a URL:** download it first, then send the bytes.

```ts
const bytes = new Uint8Array(await (await fetch("https://picsum.photos/600")).arrayBuffer());
await client.message.send(jid, { type: "image", media: bytes, mimetype: "image/jpeg" });
```

**Downloading media someone sent:**

```ts
const bytes = await client.message.downloadBytes(event);          // small files, into memory
await client.message.downloadToFile(event, "./downloads/file.jpg"); // big files, straight to disk

// Media inside the message being replied to (in a command: ctx.message.quoted.content)
const quotedBytes = await client.message.downloadBytes(ctx.message.quoted.content);
```

In commands, `ctx.downloadMedia()` does this for you: it takes the replied-to media first, otherwise the message's own.

### Polls, events, pins

```ts
// Poll. selectableCount = how many options one person may pick.
await client.message.send(jid, { type: "poll", name: "Lunch?", options: ["Pizza", "Sushi", "Salad"], selectableCount: 1 });

// Calendar event people can RSVP to. startTime is in unix seconds.
await client.message.send(jid, {
  type: "event",
  name: "Team call",
  description: "Weekly sync",
  startTime: Math.floor(Date.now() / 1000) + 3600,
  location: { latitude: 6.52, longitude: 3.37, name: "Lagos" },
  joinLink: "https://meet.example.com/abc",
});

// Pin a message for 7 days (default is 24 hours), and unpin it
await client.message.send(jid, { type: "pin", target: { remoteJid: jid, id, fromMe: true }, durationSecs: 604_800 });
await client.message.send(jid, { type: "unpin", target: { remoteJid: jid, id, fromMe: true } });
```

### Other message types (raw WhatsApp fields)

Some types have no `type: "..."` shortcut yet. Send the WhatsApp message field directly:

```ts
// Location
await client.message.send(jid, { locationMessage: { degreesLatitude: 6.45, degreesLongitude: 3.39, name: "Lagos Island" } });

// Live-location style card
await client.message.send(jid, { liveLocationMessage: { degreesLatitude: 6.52, degreesLongitude: 3.37, caption: "On my way" } });

// Contact card. waid = the WhatsApp number, so "Message" works on the card.
const vcard = "BEGIN:VCARD\nVERSION:3.0\nFN:Ada\nTEL;type=CELL;waid=2348012345678:+2348012345678\nEND:VCARD";
await client.message.send(jid, { contactMessage: { displayName: "Ada", vcard } });

// Group invite card (needs an invite code, see Groups below)
await client.message.send(jid, {
  groupInviteMessage: { groupJid, inviteCode: code, groupName: "My group", caption: "Join us!" },
});

// Turn disappearing messages on for a whole chat (7 days; 0 turns it off)
import { proto } from "zapo-js";
await client.message.send(jid, {
  protocolMessage: { type: proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING, ephemeralExpiration: 604_800 },
});
```

Buttons and list menus (`buttonsMessage`, `listMessage`) can be sent too, but WhatsApp usually only shows them for business accounts. The full list of fields is in the [message types reference](https://zapo.to/en/reference/message-types).

### Groups

```ts
// Info about one group / every group the bot is in
const group = await client.group.queryGroupMetadata(groupJid);
group.subject;                 // name
group.participants;            // [{ jid, phoneNumber?, isAdmin, isSuperAdmin }, ...]
const groups = await client.group.queryAllGroups();

// Create a group (don't include the bot itself)
const created = await client.group.createGroup("New group", ["2348012345678@s.whatsapp.net"]);

// Members: each returns one result per person. Check result.status === "ok".
await client.group.addParticipants(groupJid, [userJid]);
await client.group.removeParticipants(groupJid, [userJid]);
await client.group.promoteParticipants(groupJid, [userJid]);  // make admin
await client.group.demoteParticipants(groupJid, [userJid]);

// Name, description, settings (bot must be admin)
await client.group.setSubject(groupJid, "Renamed");
await client.group.setDescription(groupJid, "New description"); // null clears it
await client.group.setSetting(groupJid, "announcement", true);  // only admins can send
await client.group.setSetting(groupJid, "restrict", true);      // only admins can edit info
await client.group.setEphemeralDuration(groupJid, 86_400);      // disappearing messages, 24h

// Invite links
const code = await client.group.queryInviteCode(groupJid);      // https://chat.whatsapp.com/<code>
const { code: newCode } = await client.group.revokeInvite(groupJid); // new link, old one stops working
const preview = await client.group.queryGroupInviteInfo(code);  // look before joining
await client.group.joinGroupViaInvite(code);

// Join requests (for groups that need admin approval)
const requests = await client.group.queryMembershipApprovalRequests(groupJid);
await client.group.approveMembershipRequests(groupJid, [userJid]);

// Leave
await client.group.leaveGroup([groupJid]);
```

In Asena code, prefer `getGroup(jid)` from `src/features/groups.ts` (or `ctx.group()`): it caches the result for 3 minutes.

### Profile and privacy

```ts
// Is a number on WhatsApp?
const [result] = await client.profile.getLidsByPhoneNumbers(["2348012345678"]);
result.exists;   // true / false

// Someone's profile picture ("image" = full size). Returns { url } you can fetch.
const picture = await client.profile.getProfilePicture(userJid, "image");

// About text
const about = await client.profile.getStatus(userJid);
await client.profile.setStatus("Powered by Asena");

// Bot's own picture and display name
await client.profile.setProfilePicture(await Bun.file("./avatar.jpg").bytes());
await client.profile.setPushName("Asena Bot");

// Block / unblock
await client.privacy.blockUser(userJid);
await client.privacy.unblockUser(userJid);
const { jids } = await client.privacy.getBlocklist();

// Privacy settings
const settings = await client.privacy.getPrivacySettings();
await client.privacy.setPrivacySetting("lastSeen", "contacts"); // "all" | "contacts" | "none" ...
```

### Presence ("online", "typing…")

```ts
await client.presence.send("available");                                    // appear online
await client.presence.send("unavailable");                                  // appear offline
await client.presence.sendChatstate(jid, { state: "composing" });             // typing…
await client.presence.sendChatstate(jid, { state: "composing", media: "audio" }); // recording audio…
await client.presence.sendChatstate(jid, { state: "paused" });                // stop

// Get someone's online / last-seen updates (redo after each reconnect)
await client.presence.subscribe(userJid);
client.on("presence", (update) => console.log(update));
```

### Chats (your own view)

These change the chat on your phone and other devices, not for the other person.

```ts
await client.chat.setChatMute(jid, true, Date.now() + 8 * 3600_000); // mute for 8 hours
await client.chat.setChatMute(jid, false);
await client.chat.setChatPin(jid, true);
await client.chat.setChatArchive(jid, true);
await client.chat.setChatRead(jid, true);
await client.chat.setMessageStar({ chatJid: jid, id, fromMe: true }, true);
await client.chat.clearChat(jid);
```

### Status, channels and Meta AI

```ts
// Post a status (story) visible to the listed contacts
await client.status.send({ content: "Hello from Asena!", recipients: ["2348012345678@s.whatsapp.net"] });
await client.status.send({ content: { type: "image", media: "./story.jpg", mimetype: "image/jpeg" }, recipients });

// Channels
const mine = await client.newsletter.listSubscribed();
const channel = await client.newsletter.create({ name: "Asena news", description: "Updates" });
await client.newsletter.send(channel.jid, "First post!");
await client.newsletter.follow(channelJid);

// Ask a WhatsApp AI bot (usually Meta AI)
const bots = await client.bot.listBots();
const metaAi = bots.find((b) => b.isDefault) ?? bots[0];
await client.bot.sendPrompt(metaAi.jid, "Tell me a joke");
// The answer arrives in pieces on the "message_bot_chunk" event.
```

Status, channels and AI bots depend on what WhatsApp enables for your account and region.

### Listening to events

Commands cover most needs, but you can react to anything WhatsApp sends:

```ts
client.on("message", (event) => {});          // every incoming message (event.key.remoteJid = chat)
client.on("group", (event) => {});            // members added/removed/promoted, name changed...
client.on("receipt", (event) => {});          // delivered / read / played
client.on("message_addon", (event) => {});    // reactions and poll votes
client.on("message_protocol", (event) => {}); // edits and deletes
client.on("call", (event) => {});             // incoming calls (read-only)
client.on("connection", (event) => {});       // connected / disconnected
```

Asena wires `message` and `group` in `src/bot/connection.ts`. Every event and its fields: [zapo events](https://zapo.to/en/concepts/events).

### Asena helpers

Small helpers from this project that save typing:

| Helper | File | Use |
|---|---|---|
| `send(jid, content, options?)` | `src/bot/client.ts` | Same as `client.message.send`, but the bot ignores its own echo of the message. Returns the message ID. |
| `sendText(jid, text, mentions?)` | `src/bot/client.ts` | Quick text message |
| `getGroup(jid)` | `src/features/groups.ts` | Group info, cached for 3 minutes |
| `kv.get(key)`, `kv.set(key, value)` | `src/db/kv.ts` | Save any JSON value in the bot database |
| `config` | `src/config.ts` | Every `.env` setting |

### Testing with #eval

`#eval` runs TypeScript inside the running bot and replies with the result. It is the fastest way to try anything from this guide.

**Turn it on:** add `ENABLE_EVAL=true` to `.env` and restart. Only numbers in `OWNER_NUMBER` can use it.

> ⚠️ Eval can do anything the bot's computer can: read `.env`, delete files, send messages as you. Keep `OWNER_NUMBER` correct and turn it off when you don't need it.

A single expression is returned automatically. For several lines, use `return`:

```
#eval chat
#eval (await group()).participants.length
#eval
const groups = await client.group.queryAllGroups();
return groups.map((g) => g.subject);
```

Ready to use inside eval:

| Name | What it is |
|---|---|
| `client` | The zapo client |
| `chat` | The current chat's ID |
| `ctx` | The full command context (`ctx.reply`, `ctx.downloadMedia()`, ...) |
| `event` | The raw incoming message |
| `quoted` | The replied-to message, if any |
| `reply(value)` | Reply with any value |
| `send(jid, content, options?)` | Send anything anywhere |
| `group(jid?)` | Group info (this group by default) |
| `kv`, `config` | Bot database and settings |
| `zapo`, `proto` | Everything exported by `zapo-js` |

---

## Project layout

```text
src/
  index.ts          start-up
  app.ts            database, settings and plugin loading
  config.ts         every .env setting in one place
  bot/              zapo connection, session store, send helpers
  core/             command registry, message parser, ctx, handler
  features/         access, groups, moderation, setup, flags, policies, audit, ...
  db/               bot settings storage (Bun SQL), X-Asena settings import
  lib/              small helpers (media, stickers, formatting, JIDs)
  plugins/          the commands
tests/              unit tests and end-to-end tests against zapo's fake WhatsApp server
ui/                 website, dashboard and admin console (Next.js)
```

### Website and Asena server

`ui/` is the Next.js app for asena.fun, app.asena.fun (dashboard) and admin.asena.fun (admin console). It talks to the Asena server at api.asena.fun, which pairs devices, stores encrypted sessions, records metrics and runs keep-alive jobs. The server is maintained in a separate private repository; bots only need its URL (`ASENA_SERVER`).

Every incoming message goes through `core/handler.ts`: group guards (mute, anti-spam, anti-link), then rule checks (mode, permission, flags, policies, group and admin rules), then the command.

---

## Development

```bash
bun dev            # run with auto-restart
bun run typecheck  # TypeScript checks
bun test           # unit tests + end-to-end tests (needs FFmpeg)
```

The full-stack pairing test (`tests/pairing.e2e.test.ts`) also needs the private server source, Go, Postgres and Redis. It looks for the server in `../asena-server` (override with `ASENA_SERVER_DIR`) and is skipped when it is not there. It uses a local Postgres database `asena_test` and Redis; override them with `TEST_DATABASE_URL` and `TEST_REDIS_URL`.

The end-to-end tests use [`@zapo-js/fake-server`](https://zapo.to/en/guides/e2e-testing): it links the real bot to a fake WhatsApp server and checks commands, permissions, groups and media without a phone.

---

## Terminal shortcuts

| Key + Enter | Action |
|-----|--------|
| `R` | Reconnect to WhatsApp |
| `Q` | Log out (unlink the device) and exit |
| `A` | Delete all data (login and settings), after a `Y` confirmation |

---

## Upgrading from X-Asena

- Install Bun and run `bun install`. Node, npm and the old `node_modules` are no longer used.
- **You must link WhatsApp again.** The old Baileys login cannot be reused.
- **Your settings are kept.** On first start, Asena imports mode, sudo, language, notes, warns, reminders, group settings and flags from the old `./database.db` (SQLite only).
- Renamed: `#toururl` → `#tourl`, `#plugins` → `#disabled` (the old name still works), `BAILEYS_LOG_LEVEL` → `ZAPO_LOG_LEVEL`.
- Removed: `#role` (RBAC). Owner and sudo cover the same cases.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| No system group | Set `OWNER_NUMBER` and restart, or run `#setlog` in a group you created |
| Media commands fail | Install FFmpeg and make sure `ffmpeg -version` works |
| Bot ignores everyone | Check `#mode`: `private` only answers owner and sudo |
| Owner commands refused in groups | Check `OWNER_NUMBER`; the bot looks up your private group ID (LID) when it connects |
| Social download fails | Expected sometimes; these sites change and block bots |
| Admin HTTP does not start | Set both `ADMIN_HTTP_PORT` and `ADMIN_HTTP_TOKEN` |
| "Taking over; the other copy will stop" | The same session ID was started on a second machine. Only one copy runs at a time; the newest wins |
| "SESSION_ID does not match the stored session" | The ID was not copied completely. Copy it again from where you saved it |
| "Could not load the session: session revoked" | The session was revoked or never used within 24 hours. Pair again |

---

## License

[MIT](LICENSE)

## Community

- [Contributing](CONTRIBUTING.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security](SECURITY.md)
- [Changelog](CHANGELOG.md)

---

**Repo:** [shellhaki/asena](https://github.com/shellhaki/asena) · Based on [X-Asena](https://github.com/Neeraj-x0/X-Asena) by [Neeraj](https://github.com/Neeraj-x0)
