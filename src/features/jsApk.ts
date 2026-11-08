/** Distribución pública de JS TORNEOS · Jugadores desde releases oficiales de JS.
 * Envía el APK como documento de WhatsApp (no un link ni una versión de admin).
 */
import { createHash } from "node:crypto";
import type { Ctx } from "../core/context.ts";

const REPO = "angel738284-ui/js-torneos";
const RELEASES_API = "https://api.github.com/repos/" + REPO + "/releases/latest";
const DOWNLOAD_PREFIX = "https://github.com/" + REPO + "/releases/download/";
const FALLBACK_NAME = "JS-TORNEOS-JUGADORES-v1.6.5.apk";
const FALLBACK_URL = DOWNLOAD_PREFIX + "js-torneos-updater-fix-20261106/" + FALLBACK_NAME;
const FALLBACK_SHA = "510c791947dfb3f0ef7eb2030b1bb3af576e8456e326e3e48129a80d693265e7";
const MAX_BYTES = 25 * 1024 * 1024;
const CACHE_MS = 20 * 60_000;
const MIN_INTERVAL_MS = 45_000;
const userLast = new Map<string, number>();

export interface ApkSource {
  name: string;
  url: string;
  sha256: string | null;
}

function isSafeApkName(name: string):boolean {
  return /^JS-TORNEOS-JUGADORES-v\d+(?:\.\d+){1,3}\.apk$/.test(name);
}

export function safeApkAssetUrl(name:string, url:string):boolean {
  if (!isSafeApkName(name)) return false;
  try {
    const candidate = new URL(url);
    return candidate.protocol === "https:" &&
      candidate.hostname === "github.com" &&
      candidate.pathname.startsWith("/" + REPO + "/releases/download/") &&
      candidate.pathname.endsWith("/" + encodeURIComponent(name));
  } catch { return false; }
}

const fallback:ApkSource={name:FALLBACK_NAME,url:FALLBACK_URL,sha256:FALLBACK_SHA};
let latestCache: {source: ApkSource, at: number} | null = null;
let downloadCache: {source: ApkSource, bytes: Uint8Array, at: number} | null = null;
let inFlight:Promise<{source:ApkSource,bytes:Uint8Array}>|null = null;

export function pickApkSource(release:unknown):ApkSource|null {
  if (!release || typeof release!=="object") return null;
  const data=release as {assets?:Array<{name?:unknown,browser_download_url?:unknown,digest?:unknown,size?:unknown}>};
  if (!Array.isArray(data.assets)) return null;
  const match=data.assets.find(a=>
    typeof a.name==="string" && typeof a.browser_download_url==="string" &&
    safeApkAssetUrl(a.name,a.browser_download_url) &&
    typeof a.size==="number" && a.size>10000 && a.size<=MAX_BYTES
  );
  if (!match) return null;
  const digest=typeof match.digest==="string" ? match.digest : "";
  const sha=/^sha256:([a-f0-9]{64})$/i.exec(digest)?.[1]?.toLowerCase() ?? null;
  return {name:match.name as string,url:match.browser_download_url as string,sha256:sha};
}

async function latestSource():Promise<ApkSource> {
  if (latestCache && Date.now()-latestCache.at<CACHE_MS)return latestCache.source;
  let source=fallback;
  try {
    const r=await fetch(RELEASES_API,{
      headers:{Accept:"application/vnd.github+json","User-Agent":"JS-Guardian-APK"},
      signal:AbortSignal.timeout(10_000),
    });
    if (r.ok) {
      // If the current release lacks the player APK, use the pinned version.
      const data=await r.json();
      source=pickApkSource(data)??fallback;
    }
  } catch { /* The verified pinned release remains usable */ }
  latestCache={source,at:Date.now()};
  return source;
}

export function validateApkBytes(bytes:Uint8Array,source:ApkSource):void {
  if (bytes.length<10_000 || bytes.length>MAX_BYTES)
    throw new Error("El archivo APK tiene un tamaño inválido.");
  if (bytes[0]!==0x50 || bytes[1]!==0x4b || bytes[2]!==0x03 || bytes[3]!==0x04)
    throw new Error("La descarga no es un APK válido.");
  if (source.sha256) {
    const hash=createHash("sha256").update(bytes).digest("hex");
    if (hash !== source.sha256)
      throw new Error("La integridad del APK no coincide con la versión publicada.");
  }
}

async function readLimited(res:Response):Promise<Uint8Array> {
  const size=Number(res.headers.get("content-length")??0);
  if (size>MAX_BYTES)throw new Error("El APK supera el límite permitido.");
  if (!res.body)throw new Error("Descarga sin contenido.");
  const reader=res.body.getReader();
  let total=0;
  const parts:Uint8Array[]=[];
  try {
    while (true) {
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>MAX_BYTES)throw new Error("El APK supera el límite permitido.");
      parts.push(value);
    }
  } finally {reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;
  for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
  return bytes;
}

async function loadApk():Promise<{source:ApkSource,bytes:Uint8Array}> {
  if (downloadCache && Date.now()-downloadCache.at<CACHE_MS)
    return {source:downloadCache.source,bytes:downloadCache.bytes};
  if (inFlight)return inFlight;
  inFlight=(async()=>{
    const source=await latestSource();
    const response=await fetch(source.url,{signal:AbortSignal.timeout(55_000)});
    if (!response.ok)throw new Error("GitHub no entregó el instalador (HTTP "+response.status+").");
    const finalUrl=new URL(response.url);
    if (!["github.com","release-assets.githubusercontent.com"].includes(finalUrl.hostname) || finalUrl.protocol!=="https:")
      throw new Error("La descarga redirigió fuera del alojamiento autorizado.");
    const bytes=await readLimited(response);
    validateApkBytes(bytes,source);
    downloadCache={source,bytes,at:Date.now()};
    return {source,bytes};
  })();
  try{return await inFlight;}finally{inFlight=null;}
}

export async function handleApkCommand(ctx:Ctx):Promise<boolean> {
  if(ctx.command!=="apk")return false;
  const arg=ctx.args.trim().toLowerCase();
  if (arg && !["jugadores","jugador","torneos"].includes(arg)) {
    await ctx.reply("📱 Usá *.apk* o *.apk jugadores* para recibir la app *JS Torneos Jugadores*. La aplicación de administración es privada.");
    return true;
  }
  const identity=ctx.chat+":"+ctx.sender;
  const last=userLast.get(identity)??0;
  if (Date.now()-last<MIN_INTERVAL_MS){
    await ctx.reply("📦 Ya pediste el instalador hace poco. Revisá el documento anterior.");
    return true;
  }
  userLast.set(identity,Date.now());
  if (userLast.size>500)userLast.clear();
  try {
    const {source,bytes}=await ctx.withTyping(loadApk);
    await ctx.send({
      type:"document",
      media:bytes,
      mimetype:"application/vnd.android.package-archive",
      fileName:source.name,
      caption:"🎮 *JS TORNEOS · JUGADORES*\n📱 APK oficial de la comunidad.\n🌐 Web: https://jstorneos.com\nAbrí el archivo descargado para instalarlo en Android.",
    });
  } catch (error) {
    userLast.delete(identity);
    await ctx.reply(
      "⚠️ No pude adjuntar el APK en este momento. Podés descargar la versión publicada desde:\n"+
      fallback.url+"\n\nDetalle: "+
      (error instanceof Error?error.message.slice(0,100):"problema de descarga.")
    );
  }
  return true;
}
