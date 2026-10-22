import type { WaPrivacySettingName } from "zapo-js";
import type { GroupSettings } from "../features/groupSettings.ts";

// Longest command output sent back to the chat.
export const MAX_COMMAND_OUTPUT = 3_500;

export const SHELL_TIMEOUT_MS = 60_000;

export const PRIVACY: Record<string, { setting: WaPrivacySettingName; values: string[] }> = {
  lastseen: { setting: "lastSeen", values: ["all", "contacts", "contact_blacklist", "none"] },
  online: { setting: "online", values: ["all", "match_last_seen"] },
  photo: { setting: "profilePicture", values: ["all", "contacts", "contact_blacklist", "none"] },
  about: { setting: "about", values: ["all", "contacts", "contact_blacklist", "none"] },
  readreceipts: { setting: "readReceipts", values: ["all", "none"] },
  groupadd: { setting: "groupAdd", values: ["all", "contacts", "contact_blacklist"] },
  calladd: { setting: "callAdd", values: ["all", "known"] },
};

export const ONLINE_WAIT_MS = 5_000;

export const ONLINE_MAX_MEMBERS = 80;

export const PIN_SECONDS = 7 * 86_400;

export const PRESETS: Record<string, Partial<GroupSettings>> = {
  recommended: { welcome: true, goodbye: true, antilink: true, antispam: true },
  minimal: { welcome: true, goodbye: false, antilink: false, antispam: false },
  off: { welcome: false, goodbye: false, antilink: false, antispam: false },
};

export const ALWAYS_ON = new Set(["enable", "disable", "disabled", "menu", "help", "mode", "sudo"]);

export const REPO_URL = "https://github.com/shellhaki/asena";

export const FANCY_STYLES: { name: string; upper: number; lower: number }[] = [
  { name: "bold", upper: 0x1d400, lower: 0x1d41a },
  { name: "italic", upper: 0x1d434, lower: 0x1d44e },
  { name: "bubble", upper: 0x24b6, lower: 0x24d0 },
  { name: "script", upper: 0x1d4d0, lower: 0x1d4ea },
  { name: "monospace", upper: 0x1d670, lower: 0x1d68a },
];
