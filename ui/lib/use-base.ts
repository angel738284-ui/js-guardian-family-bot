"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** "/dashboard" on asena.fun and localhost, "" on app.asena.fun (and the same for /admin on admin.asena.fun). */
export function useBase(section: "dashboard" | "admin"): string {
  const subdomain = section === "dashboard" ? "app." : "admin.";
  return useSyncExternalStore(
    noop,
    () => (window.location.hostname.startsWith(subdomain) ? "" : `/${section}`),
    () => `/${section}`,
  );
}
