/** TeamSocLo OpenAI-compatible Grok chat adapter.
 * Only uses environment variables for credentials. Model output is text,
 * never a command or trusted instruction.
 */
type ConversationTurn = { role: "user" | "assistant"; content: string };
type ImageAttachment = { mimetype: string; data: string };

type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
};
type GrokResponse = {
  choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }>;
  usage?: Usage;
  error?: { message?: string } | string;
};

const ENDPOINT = "https://gpt.teamsoclo.site/v1/chat/completions";
const usageStats = {
  requests: 0,
  errors: 0,
  input: 0,
  output: 0,
  reasoning: 0,
  cached: 0,
  total: 0,
  lastAt: 0,
};

export const grokConfigured = (): boolean => Boolean(process.env.GROK_API_KEY?.trim());
export const grokPrimary = (): boolean =>
  process.env.JS_AI_PROVIDER?.trim().toLowerCase() === "grok" && grokConfigured();

export function grokUsageStats() {
  return { ...usageStats, model: process.env.GROK_MODEL?.trim() || "grok-4.7" };
}

export async function grokGenerate(
  instructions: string,
  question: string,
  turns: ConversationTurn[] = [],
  images: ImageAttachment[] = [],
): Promise<string> {
  const token = process.env.GROK_API_KEY?.trim();
  if (!token) throw new Error("Falta configurar GROK_API_KEY.");
  const model = process.env.GROK_MODEL?.trim() || "grok-4.7";
  const userContent = images.length
    ? [
        { type: "text", text: question },
        ...images.map((i) => ({
          type: "image_url",
          image_url: { url: "data:" + i.mimetype + ";base64," + i.data },
        })),
      ]
    : question;
  // The provider has been tested with standard chat/completions.
  // Reasoning stays on the provider default, which returned reasoning tokens.
  const payload = {
    model,
    stream: false,
    messages: [
      { role: "system", content: instructions },
      ...turns,
      { role: "user", content: userContent },
    ],
  };

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(55_000),
    });
    const data = await response.json().catch(() => null) as GrokResponse | null;
    if (!response.ok || data?.error) {
      throw new Error("Grok no pudo responder (HTTP " + response.status + ").");
    }
    const content = data?.choices?.[0]?.message?.content;
    const answer = typeof content === "string"
      ? content.trim()
      : Array.isArray(content)
        ? content.map((p) => p.text || "").join("\n").trim()
        : "";
    if (!answer) throw new Error("Grok devolvió una respuesta vacía.");
    const usage = data?.usage;
    usageStats.requests++;
    usageStats.input += usage?.prompt_tokens ?? 0;
    usageStats.output += usage?.completion_tokens ?? 0;
    usageStats.total += usage?.total_tokens ?? 0;
    usageStats.reasoning += usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    usageStats.cached += usage?.prompt_tokens_details?.cached_tokens ?? 0;
    usageStats.lastAt = Date.now();
    return answer.slice(0, 1800);
  } catch (error) {
    usageStats.errors++;
    throw error;
  }
}
