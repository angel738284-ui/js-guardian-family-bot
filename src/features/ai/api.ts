import { requestAiToken } from "../../bot/remoteSession.ts";
import { config } from "../../config.ts";

const TIMEOUT_MS = 60_000;
const TOKEN_MARGIN_MS = 5 * 60_000;
const TOKEN_RETRY_MS = 10 * 60_000;

let sessionToken: { token: string; expiresAt: number } | null = null;
let tokenFailure: { error: Error; until: number } | null = null;

export class AiServerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** On with AI_URL plus either AI_KEY or a session ID from asena.fun. */
export function aiConfigured(): boolean {
  return Boolean(config.ai.url && (config.ai.key || config.sessionId));
}

async function credential(): Promise<string> {
  if (config.ai.key) return config.ai.key;
  if (sessionToken && sessionToken.expiresAt * 1000 - TOKEN_MARGIN_MS > Date.now()) return sessionToken.token;
  // Do not ask the Asena server again for a while when it said no (e.g. AI is off there).
  if (tokenFailure && tokenFailure.until > Date.now()) throw tokenFailure.error;

  try {
    sessionToken = await requestAiToken();
    tokenFailure = null;
    return sessionToken.token;
  } catch (error) {
    tokenFailure = { error: error instanceof Error ? error : new Error(String(error)), until: Date.now() + TOKEN_RETRY_MS };
    throw tokenFailure.error;
  }
}

async function send<T>(method: "GET" | "POST", path: string, body: unknown): Promise<T> {
  const response = await fetch(`${config.ai.url}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${await credential()}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const data = (await response.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!response.ok) throw new AiServerError(`AI server ${response.status}: ${data.error ?? "no details"}`, response.status, data.code);
  return data;
}

export async function utilsRequest<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  try {
    return await send<T>(method, path, body);
  } catch (error) {
    // A session token can be rejected early, e.g. after the server's secret changed: get a new one once.
    if (!(error instanceof AiServerError) || error.status !== 401 || config.ai.key) throw error;
    sessionToken = null;
    return send<T>(method, path, body);
  }
}
