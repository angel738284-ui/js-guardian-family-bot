"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

export function useBase(section: "dashboard" | "admin"): string {
  const subdomain = section === "dashboard" ? "app." : "admin.";
  return useSyncExternalStore(
    noop,
    () => (window.location.hostname.startsWith(subdomain) ? "" : `/${section}`),
    () => `/${section}`,
  );
}
