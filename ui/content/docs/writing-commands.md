# Writing commands

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
ui/                 website: landing page, /docs, /pair, /stats (Next.js)
```
