import jsQR from "jsqr";
import sharp from "sharp";
import { WEATHER_CODES } from "./constants.ts";

const TIMEOUT_MS = 20_000;

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`The service answered ${response.status}. Try again later.`);
  return (await response.json()) as T;
}

export async function getBytes(url: string): Promise<{ bytes: Uint8Array; type: string }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS * 2) });
  if (!response.ok) throw new Error(`Could not download it (HTTP ${response.status}).`);
  return { bytes: new Uint8Array(await response.arrayBuffer()), type: response.headers.get("content-type") ?? "" };
}

export async function translate(text: string, to: string): Promise<{ text: string; from: string }> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
  const data = await getJson<[[string, string][], unknown, string]>(url);
  return { text: data[0].map((part) => part[0]).join(""), from: data[2] };
}

export interface Weather {
  place: string;
  description: string;
  tempC: number;
  feelsC: number;
  humidity: number;
  windKmh: number;
}

// Open-Meteo: find the place first, then its current weather.
export async function weather(city: string): Promise<Weather> {
  type Place = { results?: { name: string; country?: string; latitude: number; longitude: number }[] };
  const place = (await getJson<Place>(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`)).results?.[0];
  if (!place) throw new Error("I could not find that place.");

  type Current = { current: { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; wind_speed_10m: number; weather_code: number } };
  const fields = "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code";
  const { current } = await getJson<Current>(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=${fields}`);
  return {
    place: [place.name, place.country].filter(Boolean).join(", "),
    description: WEATHER_CODES[current.weather_code] ?? "",
    tempC: current.temperature_2m,
    feelsC: current.apparent_temperature,
    humidity: current.relative_humidity_2m,
    windKmh: current.wind_speed_10m,
  };
}

export async function lyrics(query: string): Promise<{ title: string; artist: string; text: string } | null> {
  const results = await getJson<{ trackName: string; artistName: string; plainLyrics: string | null }[]>(
    `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`,
  );
  const song = results.find((item) => item.plainLyrics);
  return song ? { title: song.trackName, artist: song.artistName, text: song.plainLyrics! } : null;
}

export function screenshotUrl(page: string, fullPage: boolean): string {
  return `https://image.thum.io/get/width/1280/${fullPage ? "fullpage/" : ""}${page}`;
}

export function qrImageUrl(text: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=12&data=${encodeURIComponent(text)}`;
}

// Decodes a QR code locally from image bytes.
export async function readQr(image: Uint8Array): Promise<string | null> {
  const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null;
}

// SFW anime images and reaction GIFs from nekos.best.
export async function animeImage(kind: string): Promise<string> {
  const data = await getJson<{ results: { url: string }[] }>(`https://nekos.best/api/v2/${kind}`);
  const url = data.results[0]?.url;
  if (!url) throw new Error("No image came back. Try again.");
  return url;
}

export async function joke(): Promise<string> {
  const data = await getJson<{ setup: string; punchline: string }>("https://official-joke-api.appspot.com/random_joke");
  return `${data.setup}\n\n_${data.punchline}_`;
}

export async function fact(): Promise<string> {
  return (await getJson<{ text: string }>("https://uselessfacts.jsph.pl/api/v2/facts/random?language=en")).text;
}
