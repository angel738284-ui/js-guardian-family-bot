import { site } from "./site";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(pathname: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${site.apiUrl}${pathname}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: init.body ? { "Content-Type": "application/json", ...init.headers } : init.headers,
  }).catch(() => {
    throw new ApiError("Could not reach the Asena server.", 0);
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error ?? `Request failed (${response.status})`, response.status);
  return body as T;
}

export const post = <T = unknown>(pathname: string, body: unknown = {}) => api<T>(pathname, { method: "POST", body: JSON.stringify(body) });
export const patch = (pathname: string, body: unknown) => api(pathname, { method: "PATCH", body: JSON.stringify(body) });
export const remove = (pathname: string) => api(pathname, { method: "DELETE" });

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
