import { config } from "../config.ts";
import { sendText } from "../bot/client.ts";
import { kv } from "../db/kv.ts";
import { hasFfmpeg } from "../lib/media.ts";
import { getMode, ownerNumbers, saveOwner, setMode } from "./access.ts";
import { getLanguage, LANGUAGES, setLanguage } from "./i18n.ts";
import { getLogGroupJid, isSetupDone, markSetupDone, systemLog } from "./logGroup.ts";

type Step = "owner" | "mode" | "lang" | "sticker" | "done";

async function getStep(): Promise<Step> {
  return (await kv.get<Step>("setup_step")) ?? "owner";
}

async function setStep(step: Step): Promise<void> {
  await kv.set("setup_step", step);
}

export async function announceStartup(): Promise<void> {
  const logJid = getLogGroupJid();
  if (!logJid) return;

  const ffmpegOk = await hasFfmpeg();
  if (!ffmpegOk) {
    systemLog("warn", "FFmpeg is not on PATH. #ytmp3, #tomp3 and video stickers will fail.");
  }

  if (await isSetupDone()) {
    systemLog("success", `${config.botName} online · mode=${await getMode()} · lang=${getLanguage()}`);
    return;
  }

  const owners = ownerNumbers().join(", ") || "_(not set)_";
  await sendText(
    logJid,
    `*Welcome to ${config.botName}*\n\n` +
      `This is your *system group*. Setup and diagnostics stay here.\n` +
      `Other chats only see short, friendly replies.\n\n` +
      `*Owner(s):* ${owners}\n` +
      `*FFmpeg:* ${ffmpegOk ? "✓" : "✕ missing"}\n\n` +
      `Run \`${config.prefix}setup\` to start, or \`${config.prefix}setup skip\` to finish now.`,
  );
}

export async function runSetup(answer: string, chat: string): Promise<string> {
  const p = config.prefix;
  if (chat !== getLogGroupJid()) {
    return `Setup runs only in the *system group*. Use \`${p}createlog\` or \`${p}setlog\` first.`;
  }

  const raw = answer.trim();
  const lower = raw.toLowerCase();

  if (lower === "skip" || lower === "done") {
    await markSetupDone(true);
    await setStep("done");
    return `✓ Setup complete. Use \`${p}menu\` in any chat.`;
  }

  if (!raw || lower === "start" || lower === "reset") {
    if (lower === "reset") await markSetupDone(false);
    await setStep("owner");
    return describeStep("owner");
  }

  const step = await getStep();

  if (step === "owner") {
    if (!/^\d{8,15}$/.test(raw)) return `Send the owner's number with country code, e.g. \`${p}setup 919876543210\``;
    await saveOwner(raw);
    await setStep("mode");
    return `✓ Owner saved.\n\n${await describeStep("mode")}`;
  }

  if (step === "mode") {
    if (lower !== "public" && lower !== "private") return `Reply \`${p}setup public\` or \`${p}setup private\``;
    await setMode(lower);
    await setStep("lang");
    return `✓ Mode: *${lower}*\n\n${await describeStep("lang")}`;
  }

  if (step === "lang") {
    try {
      await setLanguage(lower);
    } catch {
      return `Pick a language: ${LANGUAGES.join(", ")}`;
    }
    await setStep("sticker");
    return `✓ Language: *${lower}*\n\n${await describeStep("sticker")}`;
  }

  if (step === "sticker") {
    const [pack, author] = raw.split("|").map((part) => part.trim());
    if (pack) await kv.set("sticker_packname", pack);
    if (author) await kv.set("sticker_author", author);
    await markSetupDone(true);
    await setStep("done");
    return (
      `✓ *Setup complete!*\n\n` +
      `• Mode: *${await getMode()}*\n` +
      `• Language: *${getLanguage()}*\n` +
      `• Stickers: *${pack || config.sticker.packName}* / *${author || config.sticker.author}*\n\n` +
      `Try \`${p}ping\`, \`${p}menu\` or \`${p}status\`.\n` +
      `In a normal group, admins can run \`${p}groupsetup\`.`
    );
  }

  return `Setup is finished. Run \`${p}setup reset\` to start again.`;
}

async function describeStep(step: Step): Promise<string> {
  const p = config.prefix;
  switch (step) {
    case "owner": {
      const owners = ownerNumbers();
      if (owners.length) {
        await setStep("mode");
        return `✓ Owner: ${owners.join(", ")}\n\n${await describeStep("mode")}`;
      }
      return `*Step 1/4 · Owner*\nReply \`${p}setup 919876543210\` (country code + number),\nor set OWNER_NUMBER in .env.`;
    }
    case "mode":
      return (
        `*Step 2/4 · Mode*\n` +
        `• \`${p}setup public\` – anyone can use commands\n` +
        `• \`${p}setup private\` – only owner + sudo\n` +
        `Current: *${await getMode()}*`
      );
    case "lang":
      return `*Step 3/4 · Language*\nReply \`${p}setup ${LANGUAGES.join("|")}\`\nCurrent: *${getLanguage()}*`;
    case "sticker":
      return `*Step 4/4 · Sticker pack*\nReply \`${p}setup PackName|Author\`, or \`${p}setup skip\` to keep the defaults.`;
    case "done":
      return `Setup is finished. Run \`${p}setup reset\` to start again.`;
  }
}
