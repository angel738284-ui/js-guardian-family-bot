import { config } from "../config.ts";
import { kv } from "../db/kv.ts";

const STRINGS = {
  en: {
    GROUP_ONLY: "! This command only works in groups.",
    OWNER_ONLY: "! This command is only for the bot owner.",
    SUDO_ONLY: "! This command is only for the bot owner and sudo users.",
    ADMIN_ONLY: "! This command is only for group admins.",
    BOT_ADMIN: "! Make the bot a group admin first.",
    FAILED: "✕ Something went wrong. Please try again.",
    DONE: "✓ Done!",
    COMMAND_DISABLED: "! This command is disabled in this group.",
    FEATURE_DISABLED: "! The *{flag}* feature is turned off.",
    MAINTENANCE: "The bot is in maintenance mode. Try again later.",
    QUIET_HOURS: "Quiet hours. Try again later.",
    RATE_LIMIT: "Slow down, you are sending commands too fast.",
    MEDIA_DISABLED: "! Media commands are turned off.",
    BROADCAST_BLOCKED: "! Broadcast is blocked by policy.",
    WARNED: "! {user} warned ({count}/{limit})",
    KICKED_WARNS: "{user} removed after reaching the warn limit.",
    ANTILINK: "Links are not allowed here.",
    ANTISPAM: "Slow down, spam detected.",
    WELCOME_ON: "✓ Welcome messages on",
    WELCOME_OFF: "✓ Welcome messages off",
    GOODBYE_ON: "✓ Goodbye messages on",
    GOODBYE_OFF: "✓ Goodbye messages off",
    LANG_SET: "✓ Language set to *{lang}*",
    LANG_LIST: "Available: {list}\nCurrent: *{lang}*",
    REMINDER_SET: "✓ Reminder set for {when} (id `{id}`)",
    NOTE_SAVED: "✓ Note saved as *{id}*",
    NOTE_DELETED: "✓ Note *{id}* deleted",
    NOTE_NOT_FOUND: "! Note not found",
    BROADCAST_DONE: "✓ Broadcast sent to {ok}/{total} groups",
  },
  id: {
    GROUP_ONLY: "! Perintah ini hanya untuk grup.",
    OWNER_ONLY: "! Hanya untuk pemilik bot.",
    SUDO_ONLY: "! Hanya untuk pemilik bot dan pengguna sudo.",
    ADMIN_ONLY: "! Hanya untuk admin grup.",
    BOT_ADMIN: "! Jadikan bot admin grup terlebih dahulu.",
    FAILED: "✕ Terjadi kesalahan. Coba lagi.",
    DONE: "✓ Selesai!",
    COMMAND_DISABLED: "! Perintah ini dinonaktifkan di grup ini.",
    FEATURE_DISABLED: "! Fitur *{flag}* sedang dimatikan.",
    MAINTENANCE: "Bot sedang dalam perawatan. Coba lagi nanti.",
    QUIET_HOURS: "Jam tenang. Coba lagi nanti.",
    RATE_LIMIT: "Pelan-pelan, terlalu banyak perintah.",
    MEDIA_DISABLED: "! Perintah media dimatikan.",
    BROADCAST_BLOCKED: "! Broadcast diblokir oleh kebijakan.",
    WARNED: "! {user} diperingatkan ({count}/{limit})",
    KICKED_WARNS: "{user} dikeluarkan karena batas peringatan.",
    ANTILINK: "Link tidak diizinkan di sini.",
    ANTISPAM: "Pelan-pelan, spam terdeteksi.",
    WELCOME_ON: "✓ Pesan selamat datang aktif",
    WELCOME_OFF: "✓ Pesan selamat datang nonaktif",
    GOODBYE_ON: "✓ Pesan perpisahan aktif",
    GOODBYE_OFF: "✓ Pesan perpisahan nonaktif",
    LANG_SET: "✓ Bahasa diubah ke *{lang}*",
    LANG_LIST: "Tersedia: {list}\nSekarang: *{lang}*",
    REMINDER_SET: "✓ Pengingat disetel untuk {when} (id `{id}`)",
    NOTE_SAVED: "✓ Catatan *{id}* disimpan",
    NOTE_DELETED: "✓ Catatan *{id}* dihapus",
    NOTE_NOT_FOUND: "! Catatan tidak ditemukan",
    BROADCAST_DONE: "✓ Broadcast terkirim ke {ok}/{total} grup",
  },
  hi: {
    GROUP_ONLY: "! यह कमांड सिर्फ ग्रुप में चलता है।",
    OWNER_ONLY: "! सिर्फ बॉट ओनर के लिए।",
    SUDO_ONLY: "! सिर्फ बॉट ओनर और sudo यूज़र्स के लिए।",
    ADMIN_ONLY: "! सिर्फ ग्रुप एडमिन के लिए।",
    BOT_ADMIN: "! पहले बॉट को ग्रुप एडमिन बनाएं।",
    FAILED: "✕ कुछ गलत हो गया। फिर से कोशिश करें।",
    DONE: "✓ हो गया!",
    COMMAND_DISABLED: "! इस ग्रुप में यह कमांड बंद है।",
    FEATURE_DISABLED: "! *{flag}* फीचर बंद है।",
    MAINTENANCE: "बॉट मेंटेनेंस में है। बाद में कोशिश करें।",
    QUIET_HOURS: "शांत समय है। बाद में कोशिश करें।",
    RATE_LIMIT: "धीरे, बहुत ज़्यादा कमांड भेजे गए।",
    MEDIA_DISABLED: "! मीडिया कमांड बंद हैं।",
    BROADCAST_BLOCKED: "! ब्रॉडकास्ट नीति से बंद है।",
    WARNED: "! {user} को वार्न किया ({count}/{limit})",
    KICKED_WARNS: "वार्न लिमिट पर {user} को निकाला गया।",
    ANTILINK: "यहाँ लिंक की अनुमति नहीं है।",
    ANTISPAM: "धीरे, स्पैम मिला।",
    WELCOME_ON: "✓ वेलकम मैसेज चालू",
    WELCOME_OFF: "✓ वेलकम मैसेज बंद",
    GOODBYE_ON: "✓ गुडबाय मैसेज चालू",
    GOODBYE_OFF: "✓ गुडबाय मैसेज बंद",
    LANG_SET: "✓ भाषा *{lang}* सेट हुई",
    LANG_LIST: "उपलब्ध: {list}\nअभी: *{lang}*",
    REMINDER_SET: "✓ रिमाइंडर {when} के लिए सेट (id `{id}`)",
    NOTE_SAVED: "✓ नोट *{id}* सेव हुआ",
    NOTE_DELETED: "✓ नोट *{id}* हटाया",
    NOTE_NOT_FOUND: "! नोट नहीं मिला",
    BROADCAST_DONE: "✓ ब्रॉडकास्ट {ok}/{total} ग्रुप्स में भेजा",
  },
} satisfies Record<string, Record<string, string>>;

export type Language = keyof typeof STRINGS;
export type TextKey = keyof (typeof STRINGS)["en"];

export const LANGUAGES = Object.keys(STRINGS) as Language[];

function isLanguage(value: string): value is Language {
  return value in STRINGS;
}

let current: Language = isLanguage(config.defaultLang) ? config.defaultLang : "en";

export async function loadLanguage(): Promise<void> {
  const saved = await kv.get<string>("lang");
  if (saved && isLanguage(saved)) current = saved;
}

export function getLanguage(): Language {
  return current;
}

export async function setLanguage(lang: string): Promise<Language> {
  const value = lang.toLowerCase();
  if (!isLanguage(value)) throw new Error(`Unsupported language. Use: ${LANGUAGES.join(", ")}`);
  current = value;
  await kv.set("lang", value);
  return value;
}

export function t(key: TextKey, values: Record<string, string | number> = {}): string {
  let text: string = STRINGS[current][key] ?? STRINGS.en[key];
  for (const [name, value] of Object.entries(values)) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}
