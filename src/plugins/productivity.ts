import { config } from "../config.ts";
import { command } from "../core/command.ts";
import { isPrivileged } from "../features/access.ts";
import { t } from "../features/i18n.ts";
import { deleteNote, getNote, listNotes, saveNote } from "../features/notes.ts";
import { calls } from "../features/calls.ts";
import { addReminder, cancelReminder, findReminder, listAllReminders, listReminders } from "../features/reminders.ts";
import { parseWhen } from "../lib/format.ts";

command({
  name: "note",
  description: "Personal notes: set, get, del, list",
  category: "tools",
  usage: "set <id> <text> | get <id> | del <id> | list",
  run: async (ctx) => {
    const p = config.prefix;
    const [action = "", id = "", ...rest] = ctx.args.split(/\s+/);
    const owner = ctx.senderIds[0] ?? ctx.sender;

    switch (action.toLowerCase()) {
      case "list": {
        const notes = await listNotes(owner);
        await ctx.reply(
          notes.length ? `*Your notes:*\n${notes.map((note) => `• *${note.id}* — ${note.text.slice(0, 60)}`).join("\n")}` : "*Your notes:* _(none)_",
        );
        return;
      }
      case "get": {
        const note = id ? await getNote(owner, id) : null;
        if (note) await ctx.reply(`*Note \`${note.id}\`*\n${note.text}`);
        else await ctx.replyFail(t("NOTE_NOT_FOUND"));
        return;
      }
      case "del":
      case "delete":
      case "rm": {
        if (id && (await deleteNote(owner, id))) await ctx.replyOk(t("NOTE_DELETED", { id }));
        else await ctx.replyFail(t("NOTE_NOT_FOUND"));
        return;
      }
      case "set":
      case "add":
      case "save": {
        const text = rest.join(" ").trim();
        if (!id || !text) {
          await ctx.replyFail(`Usage: \`${p}note set <id> <text>\``);
          return;
        }
        await saveNote(owner, id, text);
        await ctx.replyOk(t("NOTE_SAVED", { id }));
        return;
      }
      default:
        await ctx.reply(
          `*Notes*\n\`${p}note set <id> <text>\`\n\`${p}note get <id>\`\n\`${p}note del <id>\`\n\`${p}note list\``,
        );
    }
  },
});

command({
  name: "remind",
  description: "Set a reminder in this chat; add call to get a phone call too",
  category: "tools",
  usage: "[call] <10m|2h|1d> <text>",
  run: async (ctx) => {
    const words = ctx.args.split(/\s+/).filter(Boolean);
    const callIndex = words.findIndex((word, index) => index < 2 && word.toLowerCase() === "call");
    const withCall = callIndex >= 0;
    if (withCall) words.splice(callIndex, 1);
    const [when = "", ...rest] = words;
    const at = parseWhen(when);
    const text = rest.join(" ").trim();

    if (!at || !text) {
      await ctx.replyFail(
        `Usage: \`${config.prefix}remind 10m Check the oven\`\nWith a phone call: \`${config.prefix}remind call 10m Take your meds\`\nTimes: 30s, 10m, 2h, 1d`,
      );
      return;
    }

    let call: string | undefined;
    if (withCall) {
      if (!calls.enabled()) {
        await ctx.replyFail("Calls are not available on this bot.");
        return;
      }
      call = ctx.sender;
      const pending = (await listAllReminders()).filter((reminder) => reminder.call && reminder.createdBy === (ctx.senderIds[0] ?? ""));
      if (pending.length >= 5) {
        await ctx.replyFail("You already have 5 call reminders waiting. Cancel one first.");
        return;
      }
    }

    const id = `r${Date.now().toString(36)}`;
    await addReminder({ id, chat: ctx.chat, text, at, createdBy: ctx.senderIds[0] ?? "", call });
    await ctx.replyOk(t("REMINDER_SET", { when: new Date(at).toLocaleString(), id }) + (call ? "\nI will also call you." : ""));
  },
});

command({
  name: "reminders",
  description: "List pending reminders in this chat",
  category: "tools",
  run: async (ctx) => {
    const list = await listReminders(ctx.chat);
    await ctx.reply(
      list.length
        ? `*Reminders:*\n${list.map((r) => `• \`${r.id}\` ${new Date(r.at).toLocaleString()}${r.call ? " (call)" : ""} — ${r.text}`).join("\n")}`
        : "*Reminders:* _(none)_",
    );
  },
});

command({
  name: "cancelremind",
  description: "Cancel one of your reminders",
  category: "tools",
  usage: "<id>",
  run: async (ctx) => {
    const reminder = ctx.args ? await findReminder(ctx.args) : null;
    if (!reminder || reminder.chat !== ctx.chat) {
      await ctx.replyFail("Reminder not found in this chat.");
      return;
    }

    const isCreator = ctx.senderIds.includes(reminder.createdBy);
    if (!isCreator && !(await isPrivileged(ctx))) {
      await ctx.replyFail("Only the person who set this reminder can cancel it.");
      return;
    }

    await cancelReminder(reminder.id);
    await ctx.replyOk(`Cancelled \`${reminder.id}\``);
  },
});

command({
  name: "poll",
  description: "Create a poll",
  category: "tools",
  usage: "Question? | Option A | Option B",
  run: async (ctx) => {
    const [question, ...options] = ctx.args
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);

    if (!question || options.length < 2) {
      await ctx.replyFail(`Usage: \`${config.prefix}poll Lunch? | Pizza | Sushi\` (at least 2 options)`);
      return;
    }
    if (options.length > 12) {
      await ctx.replyFail("A poll can have at most 12 options.");
      return;
    }

    await ctx.send({ type: "poll", name: question, options, selectableCount: 1 });
  },
});
