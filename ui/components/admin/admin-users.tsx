"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errorText } from "@/lib/api";
import { ago } from "@/lib/bots";
import { useBase } from "@/lib/use-base";
import { Search } from "../icons";
import { ErrorNote, inputClass, Spinner } from "../dashboard/ui";

interface AdminUser {
  id: string;
  provider: string;
  name: string;
  email: string;
  avatarUrl: string;
  createdAt: string;
  lastLoginAt: string | null;
  bots: number;
  online: number;
}

export function AdminUsers() {
  const base = useBase("admin");
  const [query, setQuery] = useState("");
  const [data, setData] = useState<{ total: number; users: AdminUser[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      api<{ total: number; users: AdminUser[] }>(`/api/admin/users?limit=200&q=${encodeURIComponent(query)}`)
        .then(setData)
        .catch((reason) => setError(errorText(reason)));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-fg">Users</h1>
          <p className="mt-1 text-sm text-muted">{data ? `${data.total} accounts` : " "}</p>
        </div>
        <label className="relative w-full max-w-xs">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or email" className={`${inputClass} pl-10`} />
        </label>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {!data ? (
        <Spinner />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-3xl border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-surface text-xs text-subtle">
              <tr>
                {["Account", "Signed in with", "Bots", "Online", "Joined", "Last sign-in"].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.users.map((user) => (
                <tr key={user.id} className="border-t border-border hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link href={`${base}/bots?user=${user.id}`} className="flex items-center gap-3">
                      {user.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={user.avatarUrl} alt="" className="h-7 w-7 rounded-full" />
                      ) : (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-xs text-fg">{user.name.slice(0, 1).toUpperCase()}</span>
                      )}
                      <span>
                        <span className="block font-medium text-fg hover:underline">{user.name || "—"}</span>
                        <span className="block text-xs text-subtle">{user.email}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 capitalize text-muted">{user.provider}</td>
                  <td className="px-4 py-3 text-muted tabular-nums">{user.bots}</td>
                  <td className="px-4 py-3 text-muted tabular-nums">{user.online}</td>
                  <td className="px-4 py-3 text-muted">{new Date(user.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-muted">{ago(user.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
