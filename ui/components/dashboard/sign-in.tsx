"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { site } from "@/lib/site";
import { Activity, Clock, Github, Google, Refresh, Terminal } from "../icons";

const errors: Record<string, string> = {
  state: "The sign-in link expired. Try again.",
  denied: "Sign-in was cancelled.",
  exchange: "The provider did not confirm the sign-in. Try again.",
  profile: "Could not read your profile from the provider.",
};

const providerInfo: Record<string, { label: string; icon: React.ReactNode }> = {
  github: { label: "Continue with GitHub", icon: <Github size={17} /> },
  google: { label: "Continue with Google", icon: <Google size={17} /> },
  dev: { label: "Continue as test user", icon: <Terminal size={17} /> },
};

export function SignIn() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/";
  const error = params.get("error");
  const [providers, setProviders] = useState<string[] | null>(null);

  useEffect(() => {
    fetch(`${site.apiUrl}/api/auth/providers`)
      .then((response) => response.json())
      .then((body: { providers: string[] }) => setProviders(body.providers))
      .catch(() => setProviders([]));
  }, []);

  return (
    <div className="grid min-h-full flex-1 lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-16 sm:px-16">
        <div className="mx-auto w-full max-w-sm">
          <a href={site.url} className="inline-flex">
            <Image src="/logo-dark.png" alt="Asena" width={109} height={26} priority />
          </a>
          <h1 className="mt-12 text-3xl font-semibold tracking-[-0.03em] text-fg">Sign in to your dashboard</h1>
          <p className="mt-3 text-muted">Name your bots, watch them live, keep them awake, and refresh a session without starting over.</p>

          {error && <p className="mt-6 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">{errors[error] ?? "Sign-in failed."}</p>}

          <div className="mt-8 space-y-3">
            {providers === null && <div className="h-12 animate-pulse rounded-full bg-surface" />}
            {providers?.length === 0 && <p className="text-sm text-muted">Sign-in is not configured on this server yet.</p>}
            {providers?.map((name) => (
              <a
                key={name}
                href={`${site.apiUrl}/api/auth/${name}/start?next=${encodeURIComponent(next)}`}
                className={`flex h-12 w-full items-center justify-center gap-3 rounded-full text-sm font-medium transition ${
                  name === "github" ? "bg-accent text-accent-fg hover:opacity-90" : "border border-border text-fg hover:bg-surface-2"
                }`}
              >
                {providerInfo[name]?.icon}
                {providerInfo[name]?.label ?? name}
              </a>
            ))}
          </div>
          <p className="mt-8 text-xs leading-relaxed text-subtle">
            We only read your name, email and avatar. Your bots keep running without the dashboard; it never sees your
            messages. See the{" "}
            <a href={`${site.url}/privacy`} className="underline underline-offset-2 hover:text-fg">
              privacy policy
            </a>{" "}
            and{" "}
            <a href={`${site.url}/terms`} className="underline underline-offset-2 hover:text-fg">
              terms
            </a>
            .
          </p>
        </div>
      </div>

      <div className="hidden border-l border-border bg-surface lg:flex lg:flex-col lg:justify-center lg:px-16">
        <ul className="max-w-md space-y-8">
          {[
            [<Activity key="a" size={18} />, "Live numbers", "Messages in and out, commands and errors, as they happen."],
            [<Clock key="c" size={18} />, "Keep-alive jobs", "Ping your bot on Render or any host that sleeps when idle."],
            [<Refresh key="r" size={18} />, "Refresh, don't restart", "Logged out? Link WhatsApp again and keep the bot's name, history and jobs."],
          ].map(([icon, title, text]) => (
            <li key={title as string} className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-border text-fg">{icon}</span>
              <div>
                <p className="font-medium text-fg">{title}</p>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
