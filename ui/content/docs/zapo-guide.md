# Using zapo

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

## WhatsApp IDs ("JIDs")

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

## Sending messages

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

## Sending media

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

## Polls, events, pins

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

## Other message types (raw WhatsApp fields)

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

## Groups

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

## Profile and privacy

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

## Presence ("online", "typing…")

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

## Chats (your own view)

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

## Status, channels and Meta AI

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

## Listening to events

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

## Asena helpers

Small helpers from this project that save typing:

| Helper | File | Use |
|---|---|---|
| `send(jid, content, options?)` | `src/bot/client.ts` | Same as `client.message.send`, but the bot ignores its own echo of the message. Returns the message ID. |
| `sendText(jid, text, mentions?)` | `src/bot/client.ts` | Quick text message |
| `getGroup(jid)` | `src/features/groups.ts` | Group info, cached for 3 minutes |
| `kv.get(key)`, `kv.set(key, value)` | `src/db/kv.ts` | Save any JSON value in the bot database |
| `config` | `src/config.ts` | Every `.env` setting |

## Testing with #eval

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
