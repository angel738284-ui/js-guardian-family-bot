/**
 * Mensajes de recuperación para fallos de YouTube desde Render.
 * No promete descarga cuando el servidor no tiene acceso.
 */
export function musicSearchUrl(query: string): string {
  return "https://www.youtube.com/results?search_query=" + encodeURIComponent(query.slice(0, 130));
}
export function isYoutubeBlocked(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /youtube\.com\/youtubei\/v1\/(search|player|browse)/i.test(message) &&
    /status(?: code)?\s*(?:400|403|429)/i.test(message);
}
export function musicErrorMessage(query: string, error: unknown): string {
  if (isYoutubeBlocked(error)) {
    return "🎵 *YouTube rechazó la solicitud del servidor.*\n\n" +
      "No pude buscar ni descargar el audio. Iniciar sesión no garantiza solucionarlo.\n\n" +
      "🔎 Abrí la búsqueda en YouTube:\n" + musicSearchUrl(query) + "\n\n" +
      "Si querés que mande MP3 directamente, necesitamos otra fuente de audio autorizada.";
  }
  const message = error instanceof Error ? error.message : "";
  if (/sign in to confirm|not a bot|youtube blocked|login|cookies/i.test(message)) {
    return "🎵 YouTube no dejó acceder a la canción desde el servidor. " +
      "No pude descargarla.\n\n" +
      "🔎 Buscala acá:\n" + musicSearchUrl(query);
  }
  return "⚠️ No pude obtener esa canción. " +
    (message ? message.slice(0, 150) + "\n\n" : "") +
    "🔎 Podés buscarla acá:\n" + musicSearchUrl(query);
}
