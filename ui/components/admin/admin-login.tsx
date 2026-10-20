"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { errorText, post } from "@/lib/api";
import { useBase } from "@/lib/use-base";
import { Lock } from "../icons";
import { Button, ErrorNote, Field, inputClass } from "../dashboard/ui";

export function AdminLogin() {
  const base = useBase("admin");
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await post("/api/admin/login", { username, password });
      router.replace(`${base}/overview`);
    } catch (reason) {
      setError(errorText(reason));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <form onSubmit={submit} className="w-full max-w-sm rounded-3xl border border-border bg-surface p-7">
        <div className="flex items-center gap-3">
          <Image src="/icon-mark.png" alt="" width={32} height={32} className="invert" />
          <div>
            <h1 className="font-semibold text-fg">Asena admin</h1>
            <p className="text-xs text-subtle">Operators only</p>
          </div>
        </div>
        <div className="mt-8 space-y-4">
          <Field label="Username">
            <input autoFocus required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className={inputClass} />
          </Field>
          <Field label="Password">
            <input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} />
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            <Lock size={15} />
            Sign in
          </Button>
        </div>
      </form>
    </div>
  );
}
