import { escapeXml } from "./format.ts";

export function styleText(text: string, upper: number, lower: number): string {
  return [...text]
    .map((char) => {
      const code = char.codePointAt(0)!;
      if (code >= 65 && code <= 90) return String.fromCodePoint(upper + code - 65);
      if (code >= 97 && code <= 122) return String.fromCodePoint(lower + code - 97);
      return char;
    })
    .join("");
}

export function textStickerSvg(text: string, color: string): string {
  return `
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
    font-size="64" font-weight="700" fill="${color}" stroke="#000000" stroke-width="6"
    paint-order="stroke" font-family="Arial Black, Arial, sans-serif">${escapeXml(text)}</text>
</svg>`;
}
