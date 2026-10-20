"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorText } from "@/lib/api";
import { ago, platformLabel, statusInfo, type Bot } from "@/lib/bots";
import { useBase } from "@/lib/use-base";
import { Search } from "../icons";
import { ErrorNote, inputClass, Spinner, StatusDot } from "../dashboard/ui";

export function AdminBots() {
  const base = useBase("admin");
  const params = useSearchParams();
  const user = params.get("user") ?? "";
  const [query, setQuery] = useState("");
  const [data, setData] = useState<{ total: number; bots: Bot[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = () =>
      api<{ total: number; bots: Bot[] }>(`/api/admin/bots?limit=200&q=${encodeURIComponent(query)}&user=${encodeURIComponent(user)}`)
        .then(setData)
        .catch((reason) => setError(errorText(reason)));
    const timer = setTimeout(load, 250);
    const refresh = setInterval(load, 30_000);
    return () => {
      clearTimeout(timer);
      clearInterval(refresh);
    };
  }, [query, user]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-fg">Bots</h1>
          <p className="mt-1 text-sm text-muted">{data ? `${data.total} bots${user ? " for this account" : ""}` : " "}</p>
        </div>
        <label className="relative w-full max-w-xs">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, owner or phone" className={`${inputClass} pl-10`} />
        </label>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {!data ? (
        <Spinner />
      ) : (
        <div className="mt-6 overflow-x-auto rounded-3xl border border-border">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-surface text-xs text-subtle">
              <tr>
                {["Bot", "Status", "WhatsApp", "Owner", "Host", "Version", "Last seen"].map((heading) => (
                  <th key={heading} className="px-4 py-3 font-medium">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.bots.map((bot) => (
                <tr key={bot.id} className="border-t border-border hover:bg-surface">
                  <td className="px-4 py-3">
                    <Link href={`${base}/bots/${bot.id}`} className="font-medium text-fg hover:underline">
                      {bot.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 text-muted">
                      <StatusDot status={bot.status} pulse={false} />
                      {statusInfo[bot.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{bot.session ? `+${bot.session.phone}` : "—"}</td>
                  <td className="px-4 py-3 text-muted">{bot.ownerName}</td>
                  <td className="px-4 py-3 text-muted">{platformLabel[bot.platform] ?? (bot.platform || "—")}</td>
                  <td className="px-4 py-3 text-muted">{bot.session?.version ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{bot.status === "online" ? "now" : ago(bot.session?.lastSeenAt)}</td>
                </tr>
              ))}
              {data.bots.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">
                    No bots found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
