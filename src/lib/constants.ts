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

// ffmpeg audio filters for #bass, #deep, #nightcore and friends.
export const AUDIO_EFFECTS: Record<string, { filter: string; description: string }> = {
  bass: { filter: "equalizer=f=54:width_type=o:width=2:g=20", description: "Heavy bass boost" },
  treble: { filter: "treble=g=10", description: "Brighter, sharper sound" },
  deep: { filter: "asetrate=44100*0.75,aresample=44100,atempo=1.333", description: "Deeper voice" },
  earrape: { filter: "volume=12,acompressor", description: "Very loud and distorted" },
  fast: { filter: "atempo=1.5", description: "Faster playback" },
  slow: { filter: "atempo=0.75", description: "Slower playback" },
  fat: { filter: "asetrate=44100*0.85,aresample=44100,atempo=1.18", description: "Lower, heavier voice" },
  nightcore: { filter: "asetrate=44100*1.25,aresample=44100", description: "Higher and faster" },
  squirrel: { filter: "asetrate=44100*1.6,aresample=44100,atempo=0.8", description: "Chipmunk voice" },
  robot: { filter: "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75", description: "Robot voice" },
  reverse: { filter: "areverse", description: "Play it backwards" },
  echo: { filter: "aecho=0.8:0.88:60:0.4", description: "Echo" },
};

// SFW anime reaction GIFs from nekos.best.
export const ANIME_REACTIONS = ["hug", "kiss", "slap", "pat", "cuddle", "bonk", "cry", "wave", "dance", "smile", "poke", "highfive", "wink", "blush", "happy", "bite", "nom", "yeet", "handhold", "punch", "tickle", "laugh", "facepalm", "shrug", "thumbsup", "sleep", "salute"];

// Open-Meteo weather codes.
export const WEATHER_CODES: Record<number, string> = {
  0: "Clear sky ☀️", 1: "Mainly clear 🌤️", 2: "Partly cloudy ⛅", 3: "Overcast ☁️",
  45: "Fog 🌫️", 48: "Freezing fog 🌫️",
  51: "Light drizzle 🌦️", 53: "Drizzle 🌦️", 55: "Heavy drizzle 🌧️",
  61: "Light rain 🌦️", 63: "Rain 🌧️", 65: "Heavy rain 🌧️",
  71: "Light snow 🌨️", 73: "Snow 🌨️", 75: "Heavy snow ❄️",
  80: "Rain showers 🌦️", 81: "Rain showers 🌧️", 82: "Violent showers ⛈️",
  95: "Thunderstorm ⛈️", 96: "Thunderstorm with hail ⛈️", 99: "Thunderstorm with hail ⛈️",
};

export const MATH_LEVELS: Record<string, { max: number; ops: string; seconds: number }> = {
  easy: { max: 10, ops: "+-", seconds: 20 },
  medium: { max: 40, ops: "+-*", seconds: 30 },
  hard: { max: 100, ops: "+-*/", seconds: 45 },
};
