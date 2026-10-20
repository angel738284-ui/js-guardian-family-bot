"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DocLink } from "@/lib/docs";

export function DocsSidebar({ sections }: { sections: { title: string; docs: DocLink[] }[] }) {
  const pathname = usePathname();
  const current = pathname === "/docs" ? "introduction" : pathname.replace("/docs/", "");

  return (
    <nav aria-label="Documentation" className="space-y-8">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">{section.title}</p>
          <ul className="mt-3 space-y-0.5">
            {section.docs.map((doc) => (
              <li key={doc.slug}>
                <Link
                  href={`/docs/${doc.slug}`}
                  aria-current={current === doc.slug ? "page" : undefined}
                  className={`-ml-3 block rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    current === doc.slug ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg"
                  }`}
                >
                  {doc.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
