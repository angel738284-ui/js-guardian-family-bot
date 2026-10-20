"use client";

import qrcode from "qrcode-generator";
import { useMemo } from "react";

const FINDER = 7;

// Finder patterns are drawn as rounded squares, so their modules are skipped in the dot grid.
function inFinder(row: number, col: number, size: number): boolean {
  const near = (value: number, start: number) => value >= start && value < start + FINDER;
  return (near(row, 0) && near(col, 0)) || (near(row, 0) && near(col, size - FINDER)) || (near(row, size - FINDER) && near(col, 0));
}

export function QrCode({ value, size = 280 }: { value: string; size?: number }) {
  const { count, dots } = useMemo(() => {
    const qr = qrcode(0, "Q");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const logoStart = Math.floor(count / 2) - 4;
    const logoEnd = logoStart + 9;
    const dots: [number, number][] = [];
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (!qr.isDark(row, col) || inFinder(row, col, count)) continue;
        if (row >= logoStart && row < logoEnd && col >= logoStart && col < logoEnd) continue;
        dots.push([row, col]);
      }
    }
    return { count, dots };
  }, [value]);

  const quiet = 3;
  const box = count + quiet * 2;
  const finders = [
    [0, 0],
    [0, count - FINDER],
    [count - FINDER, 0],
  ];
  const logoSize = 7;
  const logoAt = quiet + (count - logoSize) / 2;

  return (
    <svg viewBox={`0 0 ${box} ${box}`} width={size} height={size} role="img" aria-label="WhatsApp pairing QR code">
      <rect width={box} height={box} rx={2.5} fill="#ffffff" />
      <g fill="#09090b">
        {dots.map(([row, col]) => (
          <rect key={`${row}-${col}`} x={col + quiet} y={row + quiet} width={1.02} height={1.02} rx={0.22} />
        ))}
      </g>
      {finders.map(([row, col]) => (
        <g key={`${row}-${col}`} transform={`translate(${col + quiet} ${row + quiet})`}>
          <rect x={0.5} y={0.5} width={6} height={6} rx={1.8} fill="none" stroke="#09090b" strokeWidth={1} />
          <rect x={2} y={2} width={3} height={3} rx={0.9} fill="#09090b" />
        </g>
      ))}
      <rect x={logoAt} y={logoAt} width={logoSize} height={logoSize} rx={1.6} fill="#ffffff" />
      <image href="/icon-mark.png" x={logoAt + 1} y={logoAt + 1} width={logoSize - 2} height={logoSize - 2} />
    </svg>
  );
}
