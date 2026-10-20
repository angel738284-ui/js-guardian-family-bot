"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { api, errorText, patch, post, remove } from "@/lib/api";
import { ago, duration, needsRefresh, platformLabel, statusInfo, type BotDetail, type Counts, type Metrics } from "@/lib/bots";
import { site } from "@/lib/site";
import { compact } from "@/lib/stats";
import { useBase } from "@/lib/use-base";
import { Alert, ChevronLeft, Chip, Clock, Message, Pencil, Pulse, Refresh, Terminal, Trash } from "../icons";
import { PairFlow } from "../pair/pair-flow";
import { BarChart, type Bar } from "./bar-chart";
import { CronCard } from "./cron-card";
import { SessionReady } from "./session-ready";
import { Button, Card, Dialog, ErrorNote, inputClass, Spinner, Stat, StatusPill } from "./ui";

type Mode = "user" | "admin";

interface Beat {
  at: string;
  counts: Counts;
}

const RANGES = [
  ["1h", "Hour"],
  ["24h", "Day"],
  ["7d", "Week"],
  ["30d", "Month"],
] as const;

function bucketLabel(iso: string, range: string): string {
  const date = new Date(iso);
  if (range === "1h" || range === "24h") return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (range === "7d") return date.toLocaleString(undefined, { weekday: "short", hour: "2-digit" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function BotView({ mode }: { mode: Mode }) {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const base = useBase(mode === "user" ? "dashboard" : "admin");
  const apiBase = mode === "user" ? `/api/app/bots/${id}` : `/api/admin/bots/${id}`;

  const [detail, setDetail] = useState<BotDetail | null>(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState("24h");
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [today, setToday] = useState<Counts | null>(null);
  const [beats, setBeats] = useState<Beat[]>([]);
  const [lastBeatAt, setLastBeatAt] = useState<number | null>(null);
  const [pairing, setPairing] = useState(params.get("pair") === "1");
  const [renaming, setRenaming] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "revoke" | null>(null);

  const load = useCallback(() => {
    api<BotDetail>(apiBase)
      .then(setDetail)
      .catch((reason) => setError(errorText(reason)));
  }, [apiBase]);

  const loadMetrics = useCallback(() => {
    api<Metrics>(`${apiBase}/metrics?range=${range}`).then(setMetrics).catch(() => {});
    api<Metrics>(`${apiBase}/metrics?range=24h`)
      .then((day) =>
        setToday(
          day.points.reduce(
            (sum, point) => ({
              messagesIn: sum.messagesIn + point.messagesIn,
              messagesOut: sum.messagesOut + point.messagesOut,
              commands: sum.commands + point.commands,
              errors: sum.errors + point.errors,
            }),
            { messagesIn: 0, messagesOut: 0, commands: 0, errors: 0 },
          ),
        ),
      )
      .catch(() => {});
  }, [apiBase, range]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    loadMetrics();
    const timer = setInterval(loadMetrics, 60_000);
    return () => clearInterval(timer);
  }, [loadMetrics]);

  // Live updates: heartbeats every 30 seconds and connection events as they happen.
  useEffect(() => {
    const source = new EventSource(`${site.apiUrl}${apiBase}/live`, { withCredentials: true });
    source.onmessage = (message) => {
      const data = JSON.parse(message.data);
      if (data.type === "beat") {
        setLastBeatAt(Date.now());
        setBeats((current) => [...current.slice(-39), { at: data.at, counts: data.counts }]);
        setToday((current) =>
          current && {
            messagesIn: current.messagesIn + data.counts.messagesIn,
            messagesOut: current.messagesOut + data.counts.messagesOut,
            commands: current.commands + data.counts.commands,
            errors: current.errors + data.counts.errors,
          },
        );
        setDetail((current) =>
          current && {
            ...current,
            bot: {
              ...current.bot,
              status: data.connected ? "online" : "connecting",
              memoryMb: data.memoryMb,
              uptimeSeconds: data.uptimeSeconds,
              platform: data.platform || current.bot.platform,
              externalUrl: data.externalUrl || current.bot.externalUrl,
              session: current.bot.session && { ...current.bot.session, lastSeenAt: data.at, version: data.version || current.bot.session.version },
            },
          },
        );
      } else if (data.type === "event") {
        load();
      }
    };
    return () => source.close();
  }, [apiBase, load]);

  const bars: Bar[] = useMemo(
    () =>
      (metrics?.points ?? []).map((point) => ({
        key: point.at,
        label: bucketLabel(point.at, metrics!.range),
        value: point.messagesIn + point.messagesOut,
        details: [
          ["Received", point.messagesIn],
          ["Sent", point.messagesOut],
          ["Commands", point.commands],
          ["Errors", point.errors],
        ],
      })),
    [metrics],
  );

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!detail) return <Spinner />;
  const { bot, events, crons } = detail;
  const session = bot.session;
  const live = lastBeatAt !== null && bot.status === "online";
  const back = `${base}/bots`;

  async function act(action: () => Promise<unknown>) {
    try {
      await action();
      load();
    } catch (reason) {
      alert(errorText(reason));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={back} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
          <ChevronLeft size={15} />
          All bots
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {renaming ? (
              <RenameForm
                name={bot.name}
                onDone={async (name) => {
                  setRenaming(false);
                  if (name !== bot.name) await act(() => patch(apiBase, { name }));
                }}
              />
            ) : (
              <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-[-0.03em] text-fg">
                <span className="truncate">{bot.name}</span>
                {mode === "user" && (
                  <button type="button" onClick={() => setRenaming(true)} className="text-subtle hover:text-fg" aria-label="Rename">
                    <Pencil size={16} />
                  </button>
                )}
              </h1>
            )}
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span className="font-mono">{session ? `+${session.phone}` : "No WhatsApp linked"}</span>
              {bot.ownerName && <span>Owner: {bot.ownerName}</span>}
              {live && (
                <span className="inline-flex items-center gap-1.5 text-ok">
                  <Pulse size={14} />
                  Live
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={bot.status} />
            {mode === "user" && (
              <Button variant={needsRefresh(bot.status) || bot.status === "unpaired" ? "primary" : "ghost"} onClick={() => setPairing(true)}>
                <Refresh size={15} />
                {bot.status === "unpaired" ? "Link WhatsApp" : "Refresh session"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {(needsRefresh(bot.status) || bot.status === "waiting" || bot.status === "unpaired" || bot.status === "offline") && (
        <div className={`flex gap-3 rounded-2xl border p-4 text-sm ${needsRefresh(bot.status) ? "border-danger/30 bg-danger/5" : "border-border bg-surface"}`}>
          <span className={`mt-0.5 ${needsRefresh(bot.status) ? "text-danger" : "text-fg"}`}>
            <Alert size={16} />
          </span>
          <div className="text-muted">
            <p className="font-medium text-fg">{statusInfo[bot.status].label}</p>
            <p className="mt-1">{statusInfo[bot.status].hint}</p>
            {needsRefresh(bot.status) && mode === "user" && (
              <p className="mt-1">Refreshing keeps this bot&apos;s name, history and jobs. Only the session ID changes.</p>
            )}
            {bot.status === "offline" && bot.platform === "render" && (
              <p className="mt-1">On Render&apos;s free plan the bot sleeps after 15 idle minutes. Add a keep-alive job below.</p>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-px overflow-hidden rounded-3xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Message size={15} />} label="Messages, 24 h" value={today ? compact(today.messagesIn + today.messagesOut) : "—"} hint={today ? `${today.messagesIn.toLocaleString()} received · ${today.messagesOut.toLocaleString()} sent` : " "} />
        <Stat icon={<Terminal size={15} />} label="Commands, 24 h" value={today ? compact(today.commands) : "—"} hint={today ? `${today.errors} errors` : " "} />
        <Stat icon={<Clock size={15} />} label="Uptime" value={bot.status === "online" || bot.status === "connecting" ? duration(bot.uptimeSeconds) : "—"} hint={`Last seen ${bot.status === "online" ? "now" : ago(session?.lastSeenAt)}`} />
        <Stat icon={<Chip size={15} />} label="Memory" value={bot.memoryMb ? `${bot.memoryMb} MB` : "—"} hint={platformLabel[bot.platform] ?? (bot.platform || "Unknown host")} />
      </div>

      <Card
        title="Messages"
        action={
          <div className="inline-flex rounded-full border border-border bg-bg p-1" role="tablist" aria-label="Range">
            {RANGES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={range === value}
                onClick={() => setRange(value)}
                className={`h-7 rounded-full px-3 text-xs font-medium ${range === value ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"}`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        {metrics ? <BarChart bars={bars} label="Messages received and sent" unit="messages" labelEvery={Math.ceil(bars.length / 8)} /> : <div className="h-56" />}
        {beats.length > 1 && <LiveStrip beats={beats} />}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <CronCard mode={mode} apiBase={apiBase} crons={crons} limits={detail.limits} externalUrl={bot.externalUrl} platform={bot.platform} onChange={load} />
        <Card title="Top commands">
          {metrics?.topCommands.length ? (
            <ul className="space-y-3">
              {metrics.topCommands.map((item) => (
                <li key={item.command}>
                  <div className="flex justify-between text-sm">
                    <span className="font-mono text-fg">{item.command}</span>
                    <span className="text-muted tabular-nums">{item.count.toLocaleString()}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-fg/80" style={{ width: `${(item.count / metrics.topCommands[0]!.count) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No commands in this range yet.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card title="Session">
          {session ? (
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Info label="WhatsApp" value={`+${session.phone}`} mono />
              <Info label="Linked with" value={session.method === "code" ? "Pairing code" : "QR code"} />
              <Info label="Linked" value={new Date(session.pairedAt).toLocaleDateString()} />
              <Info label="First started" value={session.claimedAt ? ago(session.claimedAt) : "not yet"} />
              <Info label="Bot version" value={session.version ?? "—"} />
              <Info label="Last backup" value={ago(session.syncedAt)} />
              <Info label="Host" value={platformLabel[bot.platform] ?? (bot.platform || "—")} />
              <Info label="Public URL" value={bot.externalUrl || "—"} mono />
            </dl>
          ) : (
            <p className="text-sm text-muted">No WhatsApp number linked yet.</p>
          )}
          <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
            {session && !session.revokedAt && (
              <Button variant="danger" size="sm" onClick={() => setConfirm("revoke")}>
                Revoke session
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={() => setConfirm("delete")}>
              <Trash size={14} />
              Delete bot
            </Button>
          </div>
        </Card>

        <Card title="Activity">
          {events.length ? (
            <ol className="max-h-80 space-y-3 overflow-auto pr-2">
              {events.map((event, index) => (
                <li key={`${event.at}-${index}`} className="flex gap-3 text-sm">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${eventTone(event.kind)}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-fg">{event.detail}</p>
                    <p className="text-xs text-subtle" title={new Date(event.at).toLocaleString()}>
                      {ago(event.at)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">Nothing yet.</p>
          )}
        </Card>
      </div>

      {mode === "user" && (
        <Dialog open={pairing} onClose={() => { setPairing(false); load(); }} title={bot.session ? `Refresh session for ${bot.name}` : `Link WhatsApp to ${bot.name}`} wide>
          {bot.session && !needsRefresh(bot.status) && (
            <p className="mb-5 rounded-xl border border-border bg-bg px-4 py-3 text-sm text-muted">
              The current session ID stops working once you link again. Update <code className="font-mono text-fg">SESSION_ID</code> where the bot runs.
            </p>
          )}
          <PairFlow
            startPath={`${apiBase}/pair`}
            withLogin
            note="Use the number this bot should run on. Name, history and keep-alive jobs stay the same."
            renderSuccess={({ sessionId, phone }) => (
              <SessionReady sessionId={sessionId} phone={phone} onDone={() => { setPairing(false); router.replace(`${base}/bots/${id}`); load(); }} />
            )}
          />
        </Dialog>
      )}

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === "delete" ? `Delete ${bot.name}?` : "Revoke this session?"}>
        <p className="text-sm text-muted">
          {confirm === "delete"
            ? "The bot stops, its session ID stops working, and its history and jobs are deleted. This cannot be undone."
            : "The running bot stops within a minute and the session ID stops working. You can link WhatsApp again later."}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant="danger"
            onClick={async () => {
              const action = confirm;
              setConfirm(null);
              if (action === "delete") {
                await act(() => remove(apiBase));
                router.replace(back);
              } else {
                await act(() => post(`${apiBase}/revoke`));
              }
            }}
          >
            {confirm === "delete" ? "Delete bot" : "Revoke"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function eventTone(kind: string): string {
  if (kind === "connected" || kind === "session" || kind === "created") return "bg-ok";
  if (kind === "logged_out" || kind === "revoked" || kind === "replaced") return "bg-danger";
  if (kind === "disconnected") return "bg-warn";
  return "bg-subtle";
}

function Info({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className={`mt-0.5 truncate text-fg ${mono ? "font-mono text-xs leading-5" : ""}`} title={value}>
        {value}
      </dd>
    </div>
  );
}

function RenameForm({ name, onDone }: { name: string; onDone: (name: string) => void }) {
  const [value, setValue] = useState(name);
  function submit(event: FormEvent) {
    event.preventDefault();
    onDone(value.trim() || name);
  }
  return (
    <form onSubmit={submit} className="flex gap-2">
      <input autoFocus maxLength={40} value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => onDone(value.trim() || name)} className={`${inputClass} text-lg`} />
    </form>
  );
}

/** Messages per heartbeat since the page opened. */
function LiveStrip({ beats }: { beats: Beat[] }) {
  const values = beats.map((beat) => beat.counts.messagesIn + beat.counts.messagesOut);
  const max = Math.max(...values, 1);
  return (
    <div className="mt-6 border-t border-border pt-5">
      <p className="flex items-center gap-2 text-xs text-muted">
        <Pulse size={13} />
        Live, every 30 seconds since you opened this page
      </p>
      <div className="mt-3 flex h-10 items-end gap-1" aria-label="Messages per heartbeat">
        {values.map((value, index) => (
          <span key={index} className="w-2 rounded-t-sm bg-fg/70" style={{ height: `${Math.max(6, (value / max) * 100)}%` }} title={`${value} messages`} />
        ))}
      </div>
    </div>
  );
}

