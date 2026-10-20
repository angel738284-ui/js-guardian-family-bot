"use client";

import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { statusInfo, type BotStatus } from "@/lib/bots";

const tones = {
  ok: "bg-ok",
  warn: "bg-warn",
  off: "bg-subtle",
  bad: "bg-danger",
};

export function StatusDot({ status, pulse = true }: { status: BotStatus; pulse?: boolean }) {
  const tone = statusInfo[status].tone;
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0">
      {pulse && tone === "ok" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-50" />}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${tones[tone]}`} />
    </span>
  );
}

export function StatusPill({ status }: { status: BotStatus }) {
  return (
    <span className="inline-flex h-7 items-center gap-2 rounded-full border border-border bg-bg px-3 text-xs font-medium text-fg">
      <StatusDot status={status} />
      {statusInfo[status].label}
    </span>
  );
}

type Variant = "primary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-fg hover:opacity-90",
  ghost: "border border-border text-fg hover:bg-surface-2",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};

export function Button({
  variant = "ghost",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  const height = size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm";
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${height} ${variants[variant]} ${className}`}
    />
  );
}

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-3xl border border-border bg-surface p-5 sm:p-6 ${className}`}>
      {(title || action) && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="font-medium text-fg">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-muted">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <span className="mt-1.5 block text-xs text-subtle">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "h-11 w-full rounded-xl border border-border bg-bg px-3.5 text-sm text-fg outline-none transition-colors placeholder:text-subtle focus:border-border-strong";

export function Dialog({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => event.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] rounded-3xl border border-border bg-surface p-0 text-fg backdrop:bg-black/70 backdrop:backdrop-blur-sm ${wide ? "max-w-5xl" : "max-w-lg"}`}
    >
      {open && (
        <div className="p-6 sm:p-7">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>
            <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-sm text-muted hover:text-fg" aria-label="Close">
              Close
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-border-strong border-t-fg" />
      {label}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-sm text-danger">{children}</p>;
}

export function Stat({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="bg-surface p-5">
      <p className="flex items-center gap-2 text-sm text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-fg tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-subtle">{hint}</p>}
    </div>
  );
}
