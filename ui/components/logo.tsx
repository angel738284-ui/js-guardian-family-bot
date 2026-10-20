import Image from "next/image";
import Link from "next/link";

export function Logo({ height = 26 }: { height?: number }) {
  const width = Math.round(height * 4.2);
  return (
    <Link href="/" aria-label="Asena home" className="inline-flex items-center">
      <Image src="/logo-dark.png" alt="Asena" width={width} height={height} priority />
    </Link>
  );
}
