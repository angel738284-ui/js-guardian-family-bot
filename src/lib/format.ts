export function formatUptime(totalSeconds: number): string {
  const seconds = Math.floor(totalSeconds);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (rest || parts.length === 0) parts.push(`${rest}s`);
  return parts.join(" ");
}

export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = "";

  for (const word of text.split(/\s+/)) {
    let rest = word;
    while (rest.length > maxChars) {
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars);
    }

    if (!line) line = rest;
    else if (line.length + 1 + rest.length <= maxChars) line += ` ${rest}`;
    else {
      lines.push(line);
      line = rest;
    }
  }

  if (line) lines.push(line);
  return lines;
}

export function parseWhen(input: string): number | null {
  const value = input.trim().toLowerCase();
  const match = value.match(/^(\d+)\s*(s|sec|secs|m|min|mins|h|hr|hrs|d|day|days)$/);

  if (match) {
    const amount = Number(match[1]);
    const unit = match[2]!;
    const unitMs = unit.startsWith("s")
      ? 1_000
      : unit.startsWith("m")
        ? 60_000
        : unit.startsWith("h")
          ? 3_600_000
          : 86_400_000;
    return Date.now() + amount * unitMs;
  }

  const timestamp = Date.parse(input);
  if (!Number.isNaN(timestamp) && timestamp > Date.now()) return timestamp;
  return null;
}
