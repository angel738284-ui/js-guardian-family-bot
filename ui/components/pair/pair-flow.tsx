"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { site } from "@/lib/site";
import { CopyButton } from "../copy-button";
import { Alert, ArrowRight, Check, Hash, Key, Lock, QrCode as QrIcon, Refresh, Smartphone } from "../icons";
import { QrCode } from "./qr-code";

type Method = "qr" | "code";

type State =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "qr"; qr: string; ttlMs: number; receivedAt: number }
  | { phase: "code"; code: string }
  | { phase: "scanned" }
  | { phase: "success"; sessionId: string; phone: string }
  | { phase: "error"; message: string };

interface PairEvent {
  type: "qr" | "code" | "scanned" | "success" | "error" | "timeout";
  qr?: string;
  ttlMs?: number;
  code?: string;
  sessionId?: string;
  phone?: string;
  message?: string;
}

interface PairFlowProps {
  /** API path that starts the pairing. The dashboard uses its own path and sends the login cookie. */
  startPath?: string;
  withLogin?: boolean;
  note?: ReactNode;
  renderSuccess?: (result: { sessionId: string; phone: string }) => ReactNode;
}

export function PairFlow({ startPath = "/api/pair", withLogin = false, note, renderSuccess }: PairFlowProps = {}) {
  const [method, setMethod] = useState<Method>("qr");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });
  const source = useRef<EventSource | null>(null);
  const pairId = useRef<string | null>(null);

  function stop(cancel: boolean) {
    source.current?.close();
    source.current = null;
    if (cancel && pairId.current) {
      fetch(`${site.apiUrl}/api/pair/${pairId.current}`, { method: "DELETE", keepalive: true }).catch(() => {});
    }
    pairId.current = null;
  }

  useEffect(() => () => stop(true), []);

  async function start(event?: FormEvent) {
    event?.preventDefault();
    stop(true);
    setState({ phase: "starting" });

    let id: string;
    try {
      const response = await fetch(`${site.apiUrl}${startPath}`, {
        method: "POST",
        credentials: withLogin ? "include" : "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, phone }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Pairing is unavailable right now.");
      id = body.id;
    } catch (error) {
      setState({ phase: "error", message: error instanceof Error ? error.message : "Could not reach the pairing server." });
      return;
    }

    pairId.current = id;
    const events = new EventSource(`${site.apiUrl}/api/pair/${id}/events`);
    source.current = events;

    events.onmessage = (message) => {
      const data = JSON.parse(message.data) as PairEvent;
      switch (data.type) {
        case "qr":
          setState({ phase: "qr", qr: data.qr!, ttlMs: data.ttlMs ?? 20_000, receivedAt: Date.now() });
          break;
        case "code":
          setState({ phase: "code", code: data.code! });
          break;
        case "scanned":
          setState({ phase: "scanned" });
          break;
        case "success":
          setState({ phase: "success", sessionId: data.sessionId!, phone: data.phone ?? "" });
          stop(false);
          break;
        case "error":
        case "timeout":
          setState({ phase: "error", message: data.message ?? "Pairing failed." });
          stop(false);
          break;
      }
    };
    events.onerror = () => {
      if (events.readyState === EventSource.CLOSED) {
        setState((current) =>
          current.phase === "success" || current.phase === "error"
            ? current
            : { phase: "error", message: "Lost the connection to the pairing server." },
        );
      }
    };
  }

  function reset() {
    stop(true);
    setState({ phase: "idle" });
  }

  if (state.phase === "success") {
    return renderSuccess ? (
      renderSuccess({ sessionId: state.sessionId, phone: state.phone })
    ) : (
      <Success sessionId={state.sessionId} phone={state.phone} onReset={reset} />
    );
  }

  const busy = state.phase !== "idle" && state.phase !== "error";

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_1.05fr]">
      <div className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
        <div className="inline-flex rounded-full border border-border bg-bg p-1" role="tablist" aria-label="Pairing method">
          {(
            [
              ["qr", "QR code", QrIcon],
              ["code", "Pairing code", Hash],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={method === value}
              disabled={busy}
              onClick={() => setMethod(value)}
              className={`inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                method === value ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"
              }`}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        <h2 className="mt-8 text-2xl font-semibold tracking-[-0.02em] text-fg">
          {method === "qr" ? "Scan a QR code" : "Enter a pairing code"}
        </h2>
        <ol className="mt-5 space-y-3 text-sm text-muted">
          <Step n={1}>Open WhatsApp on the phone with the bot’s number.</Step>
          <Step n={2}>
            Go to <span className="text-fg">Settings → Linked devices → Link a device</span>.
          </Step>
          {method === "qr" ? (
            <Step n={3}>Point the camera at the QR code on this page.</Step>
          ) : (
            <Step n={3}>
              Tap <span className="text-fg">Link with phone number instead</span> and type the code shown here.
            </Step>
          )}
        </ol>

        <form onSubmit={start} className="mt-8 space-y-3">
          {method === "code" && (
            <label className="block">
              <span className="text-sm text-muted">Phone number with country code</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="2348012345678"
                value={phone}
                disabled={busy}
                onChange={(event) => setPhone(event.target.value.replace(/[^\d+ ]/g, ""))}
                className="mt-2 h-12 w-full rounded-xl border border-border bg-bg px-4 font-mono text-fg outline-none transition-colors placeholder:text-subtle focus:border-border-strong"
              />
            </label>
          )}
          <button
            type="submit"
            disabled={busy || (method === "code" && phone.replace(/\D/g, "").length < 8)}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-accent font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {state.phase === "error" ? <Refresh size={16} /> : null}
            {state.phase === "error" ? "Try again" : method === "qr" ? "Show QR code" : "Get pairing code"}
            {state.phase === "idle" ? <ArrowRight size={16} /> : null}
          </button>
          {busy && (
            <button type="button" onClick={reset} className="w-full text-center text-sm text-muted hover:text-fg">
              Cancel
            </button>
          )}
        </form>

        <div className="mt-8 flex gap-3 rounded-2xl border border-border bg-bg p-4 text-sm text-muted">
          <span className="mt-0.5 text-fg">
            <Lock size={16} />
          </span>
          <p>{note ?? "Use a number you control. Run Asena on your own computer, a server, or Render."}</p>
        </div>
      </div>

      <Stage state={state} method={method} />
    </div>
  );
}

export function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs text-fg">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

function Stage({ state, method }: { state: State; method: Method }) {
  return (
    <div className="flex min-h-[460px] flex-col items-center justify-center rounded-3xl border border-border bg-surface p-8 text-center">
      {state.phase === "idle" && (
        <Placeholder
          icon={method === "qr" ? <QrIcon size={22} /> : <Smartphone size={22} />}
          title={method === "qr" ? "Your QR code appears here" : "Your pairing code appears here"}
          text="It refreshes automatically until you link the device."
        />
      )}

      {state.phase === "starting" && <Spinner label="Connecting to WhatsApp…" />}

      {state.phase === "qr" && <QrStage qr={state.qr} ttlMs={state.ttlMs} receivedAt={state.receivedAt} />}

      {state.phase === "code" && (
        <div>
          <p className="text-sm text-muted">Enter this code on your phone</p>
          <div className="mt-6 flex items-center justify-center gap-2" aria-label={`Pairing code ${state.code}`}>
            {state.code.split("").map((char, index) => (
              <span key={index} className="flex items-center">
                <span className="flex h-14 w-11 items-center justify-center rounded-xl border border-border-strong bg-bg font-mono text-2xl font-semibold text-fg sm:h-16 sm:w-12">
                  {char}
                </span>
                {index === 3 && <span className="mx-1 text-subtle">–</span>}
              </span>
            ))}
          </div>
          <div className="mt-6 flex justify-center">
            <CopyButton value={state.code} label="Copy code" />
          </div>
        </div>
      )}

      {state.phase === "scanned" && <Spinner label="Linking… keep WhatsApp open for a few seconds." />}

      {state.phase === "error" && (
        <Placeholder icon={<Alert size={22} />} title="Pairing did not finish" text={state.message} />
      )}
    </div>
  );
}

function QrStage({ qr, ttlMs, receivedAt }: { qr: string; ttlMs: number; receivedAt: number }) {
  const [now, setNow] = useState(receivedAt);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, 1 - (now - receivedAt) / ttlMs);

  return (
    <div className="flex flex-col items-center">
      <div className="rounded-[28px] bg-white p-3 shadow-[0_20px_60px_-25px_rgb(0_0_0/0.45)]">
        <QrCode value={qr} size={272} />
      </div>
      <div className="mt-6 h-1 w-56 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <div className="h-full rounded-full bg-fg transition-[width] duration-200 ease-linear" style={{ width: `${left * 100}%` }} />
      </div>
      <p className="mt-3 text-xs text-subtle">The code refreshes automatically.</p>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-border-strong border-t-fg" />
      <p className="max-w-xs text-sm text-muted">{label}</p>
    </div>
  );
}

function Placeholder({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex max-w-xs flex-col items-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border text-fg">{icon}</span>
      <p className="mt-5 font-medium text-fg">{title}</p>
      <p className="mt-2 text-sm text-muted">{text}</p>
    </div>
  );
}

function Success({ sessionId, phone, onReset }: { sessionId: string; phone: string; onReset: () => void }) {
  const envLine = `SESSION_ID=${sessionId}`;
  return (
    <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-surface p-6 sm:p-10">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-fg">
          <Check size={18} />
        </span>
        <div>
          <h2 className="text-xl font-semibold text-fg">Device linked</h2>
          {phone && <p className="text-sm text-muted">WhatsApp +{phone}</p>}
        </div>
      </div>

      <p className="mt-8 text-sm text-muted">Your session ID</p>
      <div className="mt-2 flex items-center gap-3 rounded-2xl border border-border bg-bg p-3 pl-4">
        <code className="min-w-0 flex-1 break-all font-mono text-sm text-fg">{sessionId}</code>
        <CopyButton value={sessionId} />
      </div>

      <div className="mt-4 flex gap-3 rounded-2xl border border-border p-4 text-sm text-muted">
        <span className="mt-0.5 text-fg">
          <Alert size={16} />
        </span>
        <p>
          Treat this like a password: anyone with it can use this WhatsApp account. The login is stored encrypted
          with this ID, and we only keep a hash of it, so we cannot read it. Unused IDs expire after 24 hours.
        </p>
      </div>

      <h3 className="mt-10 font-medium text-fg">Next steps</h3>
      <ol className="mt-4 space-y-5 text-sm text-muted">
        <Step n={1}>
          Get Asena:
          <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-bg p-3 font-mono text-xs text-fg">
            git clone {site.github}.git{"\n"}cd asena && bun install
          </pre>
        </Step>
        <Step n={2}>
          <span className="flex flex-wrap items-center justify-between gap-2">
            Add this line to <code className="font-mono text-fg">.env</code>:
            <CopyButton value={envLine} label="Copy line" />
          </span>
          <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-bg p-3 font-mono text-xs text-fg">{envLine}</pre>
        </Step>
        <Step n={3}>
          Start the bot. It loads the session from the Asena server, wherever it runs:
          <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-bg p-3 font-mono text-xs text-fg">bun start</pre>
        </Step>
      </ol>

      <div className="mt-8 flex gap-3 rounded-2xl border border-border p-4 text-sm text-muted">
        <span className="mt-0.5 text-fg">
          <Key size={16} />
        </span>
        <p>
          Want metrics, keep-alive pings and one-click session refresh?{" "}
          <a href={`${site.appUrl}/?import=1`} className="text-fg underline underline-offset-4">
            Add this session to the dashboard
          </a>
          .
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link href="/docs/pairing" className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-accent-fg hover:opacity-90">
          Read the pairing guide
          <ArrowRight size={15} />
        </Link>
        <button type="button" onClick={onReset} className="inline-flex h-11 items-center justify-center rounded-full border border-border px-5 text-sm font-medium text-fg hover:bg-surface-2">
          Pair another device
        </button>
      </div>
    </div>
  );
}
