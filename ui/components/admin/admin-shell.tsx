"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api, ApiError, post } from "@/lib/api";
import { useBase } from "@/lib/use-base";
import { LogOut } from "../icons";
import { Spinner } from "../dashboard/ui";

export function AdminShell({ children }: { children: ReactNode }) {
  const base = useBase("admin");
  const pathname = usePathname();
  const router = useRouter();
  const onLogin = pathname.endsWith("/login");
  const [admin, setAdmin] = useState<string | null>(null);

  useEffect(() => {
    if (onLogin) return;
    api<{ username: string }>("/api/admin/me")
      .then((me) => setAdmin(me.username))
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) router.replace(`${base}/login`);
      });
  }, [onLogin, router, base]);

  if (onLogin) return <>{children}</>;

  const section = pathname.replace(/^\/admin/, "") || "/overview";
  const tabs = [
    ["/overview", "Overview"],
    ["/bots", "Bots"],
    ["/users", "Users"],
  ] as const;

  async function signOut() {
    await post("/api/admin/logout").catch(() => {});
    router.replace(`${base}/login`);
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6">
          <Link href={`${base}/overview`} className="flex items-center gap-3">
            <Image src="/icon-mark.png" alt="" width={26} height={26} className="invert" />
            <span className="rounded-full border border-danger/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-danger">Admin</span>
          </Link>
          <nav className="flex items-center gap-1">
            {tabs.map(([href, label]) => {
              const active = section.startsWith(href);
              return (
                <Link key={href} href={`${base}${href}`} className={`rounded-full px-3 py-1.5 text-sm ${active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"}`}>
                  {label}
                </Link>
              );
            })}
          </nav>
          {admin && (
            <button type="button" onClick={signOut} className="ml-auto inline-flex items-center gap-2 text-sm text-muted hover:text-fg">
              <LogOut size={15} />
              {admin}
            </button>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">{admin ? children : <Spinner />}</main>
    </div>
  );
}
