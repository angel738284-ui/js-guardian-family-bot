"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { nav, site } from "@/lib/site";
import { ArrowRight, Github, Menu } from "./icons";
import { Logo } from "./logo";

export function SiteHeader() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-4 sm:px-6">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                isActive(item.href) ? "text-fg" : "text-muted hover:text-fg"
              }`}
            >
              {item.label}
            </Link>
          ))}
          <a
            href={site.github}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted transition-colors hover:text-fg"
          >
            <Github size={15} />
            GitHub
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <a href={site.appUrl} className="hidden h-9 items-center rounded-full px-3 text-sm text-muted transition-colors hover:text-fg sm:inline-flex">
            Dashboard
          </a>
          <Link
            href="/pair"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            Pair a device
            <ArrowRight size={15} />
          </Link>

          <details className="relative md:hidden">
            <summary className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-full border border-border text-muted [&::-webkit-details-marker]:hidden">
              <Menu size={17} />
              <span className="sr-only">Menu</span>
            </summary>
            <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-border bg-surface p-2 shadow-xl">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="block rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                  {item.label}
                </Link>
              ))}
              <a href={site.appUrl} className="block rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                Dashboard
              </a>
              <a href={site.github} className="block rounded-xl px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">
                GitHub
              </a>
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
