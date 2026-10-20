"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, errorText, post } from "@/lib/api";
import { ago, platformLabel, statusInfo, type Bot } from "@/lib/bots";
import { useBase } from "@/lib/use-base";
import { ArrowRight, Import, Plus, QrCode, Server, Smartphone } from "../icons";
import { Button, Dialog, ErrorNote, Field, inputClass, Spinner, StatusPill } from "./ui";
import { useUser } from "./shell";

export function BotList() {
  const user = useUser();
  const base = useBase("dashboard");
  const params = useSearchParams();
  const [bots, setBots] = useState<Bot[] | null>(null);
  const [limit, setLimit] = useState(10);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState<"pair" | "import" | null>(params.get("import") ? "import" : null);

  const load = useCallback(() => {
    api<{ bots: Bot[]; limit: number }>("/api/app/bots")
      .then((body) => {
        setBots(body.bots);
        setLimit(body.limit);
      })
      .catch((reason) => setError(errorText(reason)));
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!bots) return <Spinner />;

  const online = bots.filter((bot) => bot.status === "online").length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Hi {user?.name.split(" ")[0]}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-fg">Your bots</h1>
          {bots.length > 0 && (
            <p className="mt-2 text-sm text-muted">
              {online} of {bots.length} online
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setCreating("import")}>
            <Import size={15} />
            Import session ID
          </Button>
          <Button variant="primary" onClick={() => setCreating("pair")} disabled={bots.length >= limit}>
            <Plus size={15} />
            New bot
          </Button>
        </div>
      </div>

      {bots.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-border-strong p-10 text-center sm:p-16">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border text-fg">
            <Smartphone size={20} />
          </span>
          <h2 className="mt-5 text-xl font-semibold text-fg">Create your first bot</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            Give it a name and link a WhatsApp number. You get a session ID to run it on your computer or on Render.
          </p>
          <Button variant="primary" className="mt-6" onClick={() => setCreating("pair")}>
            <Plus size={15} />
            New bot
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bots.map((bot) => (
            <Link
              key={bot.id}
              href={`${base}/bots/${bot.id}`}
              className="group rounded-3xl border border-border bg-surface p-5 transition-colors hover:border-border-strong"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="truncate text-lg font-medium text-fg">{bot.name}</h2>
                <StatusPill status={bot.status} />
              </div>
              <p className="mt-1 font-mono text-sm text-muted">{bot.session ? `+${bot.session.phone}` : "No WhatsApp linked"}</p>
              <dl className="mt-6 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-subtle">Last seen</dt>
                  <dd className="mt-0.5 text-fg">{bot.status === "online" ? "now" : ago(bot.session?.lastSeenAt)}</dd>
                </div>
                <div>
                  <dt className="text-subtle">Runs on</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 text-fg">
                    <Server size={12} />
                    {platformLabel[bot.platform] ?? (bot.platform || "—")}
                  </dd>
                </div>
              </dl>
              <p className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-muted">
                {statusInfo[bot.status].hint}
                <ArrowRight size={14} className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
              </p>
            </Link>
          ))}
        </div>
      )}

      <NewBotDialog mode={creating} onClose={() => setCreating(null)} />
    </div>
  );
}

function NewBotDialog({ mode, onClose }: { mode: "pair" | "import" | null; onClose: () => void }) {
  const router = useRouter();
  const base = useBase("dashboard");
  const [name, setName] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = mode === "import" ? { name, sessionId: sessionId.trim() } : { name };
      const { id } = await post<{ id: string }>("/api/app/bots", body);
      router.push(`${base}/bots/${id}${mode === "pair" ? "?pair=1" : ""}`);
    } catch (reason) {
      setError(errorText(reason));
      setBusy(false);
    }
  }

  return (
    <Dialog open={mode !== null} onClose={onClose} title={mode === "import" ? "Import a session ID" : "New bot"}>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Name" hint="Only you see it. For example: Runners Club, Shop support.">
          <input autoFocus required maxLength={40} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} placeholder="My bot" />
        </Field>
        {mode === "import" && (
          <Field label="Session ID" hint="The ID you got on asena.fun/pair. The bot keeps running; it just shows up here.">
            <input
              required
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              className={`${inputClass} font-mono`}
              placeholder="ASENA_..."
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button type="submit" variant="primary" className="w-full" disabled={busy || !name.trim()}>
          {mode === "import" ? <Import size={15} /> : <QrCode size={15} />}
          {mode === "import" ? "Import" : "Create and link WhatsApp"}
        </Button>
      </form>
    </Dialog>
  );
}
