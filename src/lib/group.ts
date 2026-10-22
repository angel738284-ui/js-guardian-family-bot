import { config } from "../config.ts";
import type { Ctx } from "../core/context.ts";
import { getGroupSettings, updateGroupSettings } from "../features/groupSettings.ts";
import { forgetGroup } from "../features/groups.ts";
import { t } from "../features/i18n.ts";
import { getTimezone, parseClock, setSchedule } from "../features/schedule.ts";
import { nextValue } from "./args.ts";
import { mentionTag } from "./jid.ts";

export async function changeAdminRole(ctx: Ctx, makeAdmin: boolean): Promise<void> {
  const target = ctx.target();
  if (!target) {
    await ctx.replyFail(`Mention a user or reply to their message.\nUsage: \`${config.prefix}${ctx.command} @user\``);
    return;
  }

  const results = makeAdmin
    ? await ctx.client.group.promoteParticipants(ctx.chat, [target])
    : await ctx.client.group.demoteParticipants(ctx.chat, [target]);
  forgetGroup(ctx.chat);

  if (results[0]?.status !== "ok") {
    await ctx.replyFail(`Could not change ${mentionTag(target)} (code ${results[0]?.code ?? "?"}).`, { mentions: [target] });
    return;
  }
  await ctx.replyOk(`${mentionTag(target)} is ${makeAdmin ? "now an admin" : "no longer an admin"}.`, { mentions: [target] });
}

export async function groupThumbnail(ctx: Ctx): Promise<Uint8Array | null> {
  try {
    const picture = await ctx.client.profile.getProfilePicture(ctx.chat, "preview");
    if (!picture.url) return null;
    const response = await fetch(picture.url, { signal: AbortSignal.timeout(10_000) });
    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  } catch {
    return null;
  }
}

export async function messageToggle(ctx: Ctx, flag: "welcome" | "goodbye", textField: "welcomeText" | "goodbyeText") {
  const settings = await getGroupSettings(ctx.chat);
  const isToggle = !ctx.args || ["on", "off"].includes(ctx.args.toLowerCase());

  if (isToggle) {
    const enabled = nextValue(ctx.args, settings[flag]);
    await updateGroupSettings(ctx.chat, { [flag]: enabled });
    const key = flag === "welcome" ? (enabled ? "WELCOME_ON" : "WELCOME_OFF") : enabled ? "GOODBYE_ON" : "GOODBYE_OFF";
    await ctx.reply(t(key));
    return;
  }

  await updateGroupSettings(ctx.chat, { [flag]: true, [textField]: ctx.args });
  await ctx.replyOk(`${flag === "welcome" ? "Welcome" : "Goodbye"} text saved and turned on.\nPlaceholders: @user @group @count`);
}

export async function requireTarget(ctx: Ctx): Promise<string | null> {
  const target = ctx.target();
  if (!target) await ctx.replyFail(`Mention a user or reply to their message.\nUsage: \`${config.prefix}${ctx.command} @user\``);
  return target;
}

export async function scheduleCommand(ctx: Ctx, field: "close" | "open"): Promise<void> {
  const name = field === "close" ? "automute" : "autounmute";
  if (ctx.args.toLowerCase() === "off") {
    await setSchedule(ctx.chat, { [field]: undefined });
    await ctx.replyOk(`Automatic ${field} turned off.`);
    return;
  }
  const clock = parseClock(ctx.args);
  if (!clock) {
    await ctx.replyFail(`Usage: \`${config.prefix}${name} 22:00\`, \`${config.prefix}${name} 7am\` or \`${config.prefix}${name} off\``);
    return;
  }
  await setSchedule(ctx.chat, { [field]: clock });
  await ctx.replyOk(`The group will ${field} every day at ${clock} (${await getTimezone()}).`);
}
