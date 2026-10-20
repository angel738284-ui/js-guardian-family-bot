"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError, errorText, post, remove } from "@/lib/api";
import { site } from "@/lib/site";
import { useBase } from "@/lib/use-base";
import { Book, LogOut, Trash } from "../icons";
import { Button, Dialog, Spinner } from "./ui";

export interface User {
  id: string;
  provider: string;
  name: string;
  email: string;
  avatarUrl: string;
}

const UserContext = createContext<User | null>(null);
export const useUser = () => useContext(UserContext);

export function DashboardShell({ children }: { children: ReactNode }) {
  const base = useBase("dashboard");
  const pathname = usePathname();
  const router = useRouter();
  const onLogin = pathname.endsWith("/login");
  const [user, setUser] = useState<User | null>(null);
  const [failed, setFailed] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (onLogin) return;
    let cancelled = false;
    api<User>("/api/app/me")
      .then((me) => !cancelled && setUser(me))
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          const next = pathname.replace(/^\/dashboard/, "") || "/";
          router.replace(`${base}/login?next=${encodeURIComponent(next + window.location.search)}`);
        } else setFailed(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [onLogin, pathname, router, base]);

  if (onLogin) return <>{children}</>;

  async function deleteAccount() {
    try {
      await remove("/api/app/me");
      setDeleting(false);
      router.replace(`${base}/login`);
    } catch (error) {
      alert(errorText(error));
    }
  }

  async function signOut() {
    await post("/api/auth/logout").catch(() => {});
    router.replace(`${base}/login`);
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href={`${base}/bots`} className="flex items-center gap-3">
            <Image src="/icon-mark.png" alt="" width={26} height={26} className="invert" />
            <span className="font-medium text-fg">Asena</span>
            <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-subtle">Dashboard</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1">
            <a href={`${site.url}/docs/dashboard`} className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted hover:text-fg sm:inline-flex">
              <Book size={15} />
              Guide
            </a>
            {user && (
              <details className="relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 text-sm text-fg [&::-webkit-details-marker]:hidden">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-xs">{user.name.slice(0, 1).toUpperCase()}</span>
                  )}
                  <span className="max-w-32 truncate">{user.name}</span>
                </summary>
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-border bg-surface p-2 shadow-xl">
                  <p className="truncate px-3 py-2 text-xs text-subtle">
                    Signed in with {user.provider === "github" ? "GitHub" : user.provider === "google" ? "Google" : user.provider}
                  </p>
                  <button type="button" onClick={signOut} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-fg">
                    <LogOut size={15} />
                    Sign out
                  </button>
                  <button type="button" onClick={() => setDeleting(true)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-danger">
                    <Trash size={15} />
                    Delete account
                  </button>
                </div>
              </details>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {failed ? <p className="py-16 text-center text-sm text-muted">{failed}</p> : user ? <UserContext value={user}>{children}</UserContext> : <Spinner />}
      </main>
      <Dialog open={deleting} onClose={() => setDeleting(false)} title="Delete your account?">
        <p className="text-sm text-muted">
          All your bots stop within a minute, their session IDs stop working, and their history and keep-alive jobs are deleted. This cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={() => setDeleting(false)}>Cancel</Button>
          <Button variant="danger" onClick={deleteAccount}>
            Delete account
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
