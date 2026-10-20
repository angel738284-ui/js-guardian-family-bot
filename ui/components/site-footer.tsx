import Link from "next/link";
import { site } from "@/lib/site";
import { Logo } from "./logo";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/pair", label: "Pair a device" },
      { href: "/stats", label: "Live stats" },
      { href: "/docs", label: "Documentation" },
    ],
  },
  {
    title: "Docs",
    links: [
      { href: "/docs/getting-started", label: "Getting started" },
      { href: "/docs/commands", label: "Commands" },
      { href: "/docs/zapo-guide", label: "Developer guide" },
    ],
  },
  {
    title: "Project",
    links: [
      { href: site.github, label: "GitHub" },
      { href: `${site.github}/blob/main/LICENSE`, label: "MIT license" },
      { href: `${site.github}/security/advisories/new`, label: "Report a vulnerability" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <Logo height={22} />
          <p className="max-w-xs text-sm text-muted">
            WhatsApp automation for groups, creators and everyone in between. Free and open source.
          </p>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <h3 className="text-sm font-medium text-fg">{column.title}</h3>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted transition-colors hover:text-fg">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-subtle sm:flex-row sm:justify-between sm:px-6">
          <p>© 2026 shellhaki. MIT licensed.</p>
          <p>
            Based on{" "}
            <a href="https://github.com/Neeraj-x0/X-Asena" className="underline underline-offset-2 hover:text-fg">
              X-Asena
            </a>{" "}
            by Neeraj. Not affiliated with WhatsApp.
          </p>
        </div>
      </div>
    </footer>
  );
}
