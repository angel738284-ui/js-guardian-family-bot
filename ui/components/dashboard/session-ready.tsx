"use client";

import { useState } from "react";
import { renderDeployUrl, site } from "@/lib/site";
import { CopyButton } from "../copy-button";
import { Alert, Check, Server, Terminal } from "../icons";
import { Step } from "../pair/pair-flow";
import { Button } from "./ui";

/** Shown once after linking: the new session ID and how to run the bot with it. */
export function SessionReady({ sessionId, phone, onDone }: { sessionId: string; phone: string; onDone: () => void }) {
  const [where, setWhere] = useState<"render" | "local">("render");
  const envLine = `SESSION_ID=${sessionId}`;

  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-fg">
          <Check size={18} />
        </span>
        <div>
          <h3 className="text-lg font-semibold text-fg">WhatsApp linked</h3>
          {phone && <p className="text-sm text-muted">+{phone}</p>}
        </div>
      </div>

      <p className="mt-6 text-sm text-muted">Session ID</p>
      <div className="mt-2 flex items-center gap-3 rounded-2xl border border-border bg-bg p-3 pl-4">
        <code className="min-w-0 flex-1 break-all font-mono text-sm text-fg">{sessionId}</code>
        <CopyButton value={sessionId} />
      </div>
      <p className="mt-3 flex gap-2 text-xs text-muted">
        <Alert size={14} className="mt-px shrink-0" />
        Copy it now; it is shown only once. Anyone with it can run this WhatsApp account.
      </p>

      <div className="mt-8 inline-flex rounded-full border border-border bg-bg p-1" role="tablist">
        {(
          [
            ["render", "On Render", Server],
            ["local", "On my computer or server", Terminal],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={where === value}
            onClick={() => setWhere(value)}
            className={`inline-flex h-8 items-center gap-2 rounded-full px-3 text-xs font-medium ${where === value ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"}`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {where === "render" ? (
        <ol className="mt-6 space-y-4 text-sm text-muted">
          <Step n={1}>
            New bot:{" "}
            <a href={renderDeployUrl} target="_blank" rel="noreferrer" className="text-fg underline underline-offset-4">
              Deploy to Render
            </a>{" "}
            and paste the session ID when it asks for <code className="font-mono text-fg">SESSION_ID</code>.
          </Step>
          <Step n={2}>
            Already on Render: open the service, go to <span className="text-fg">Environment</span>, replace <code className="font-mono text-fg">SESSION_ID</code>, and save. Render restarts the bot.
          </Step>
          <Step n={3}>Back here, add a keep-alive job so the free plan does not put the bot to sleep.</Step>
        </ol>
      ) : (
        <ol className="mt-6 space-y-4 text-sm text-muted">
          <Step n={1}>
            <span className="flex flex-wrap items-center justify-between gap-2">
              Put this line in <code className="font-mono text-fg">.env</code>, replacing any old one:
              <CopyButton value={envLine} label="Copy line" />
            </span>
            <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-bg p-3 font-mono text-xs text-fg">{envLine}</pre>
          </Step>
          <Step n={2}>
            Start or restart the bot:
            <pre className="mt-2 overflow-x-auto rounded-xl border border-border bg-bg p-3 font-mono text-xs text-fg">bun start</pre>
          </Step>
        </ol>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={onDone}>
          Done
        </Button>
        <a href={`${site.url}/docs/${where === "render" ? "deploy-render" : "getting-started"}`} className="text-sm text-muted hover:text-fg">
          Read the guide
        </a>
      </div>
    </div>
  );
}
