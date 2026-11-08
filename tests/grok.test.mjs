import { test } from "node:test";
import assert from "node:assert/strict";
import { grokConfigured, grokPrimary, grokGenerate, grokUsageStats } from "../src/features/ai/grok.ts";

test("Grok adapter sends chat messages and accounts for cached/reasoning tokens", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.GROK_API_KEY;
  const oldProvider = process.env.JS_AI_PROVIDER;
  process.env.GROK_API_KEY = "test-key-not-real";
  process.env.JS_AI_PROVIDER = "grok";
  const before = grokUsageStats();
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://gpt.teamsoclo.site/v1/chat/completions");
      assert.equal(options.headers.Authorization, "Bearer test-key-not-real");
      const body = JSON.parse(options.body);
      assert.equal(body.model, "grok-4.7");
      assert.deepEqual(body.messages.map((m) => m.role), ["system", "assistant", "user"]);
      return {
        ok: true, status: 200,
        json: async () => ({
          choices: [{ message: { content: "Respuesta correcta" } }],
          usage: {
            prompt_tokens: 3386, completion_tokens: 845, total_tokens: 4231,
            prompt_tokens_details: { cached_tokens: 3328 },
            completion_tokens_details: { reasoning_tokens: 716 },
          },
        }),
      };
    };
    assert.equal(grokConfigured(), true);
    assert.equal(grokPrimary(), true);
    assert.equal(await grokGenerate("Reglas", "Pregunta", [{ role: "assistant", content: "Hola" }]), "Respuesta correcta");
    const after = grokUsageStats();
    assert.equal(after.requests - before.requests, 1);
    assert.equal(after.total - before.total, 4231);
    assert.equal(after.cached - before.cached, 3328);
    assert.equal(after.reasoning - before.reasoning, 716);
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GROK_API_KEY; else process.env.GROK_API_KEY = oldKey;
    if (oldProvider === undefined) delete process.env.JS_AI_PROVIDER; else process.env.JS_AI_PROVIDER = oldProvider;
  }
});

test("Grok adapter reports provider errors without exposing the credential", async () => {
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.GROK_API_KEY;
  process.env.GROK_API_KEY = "private-test-secret";
  try {
    globalThis.fetch = async () => ({ ok: false, status: 429, json: async () => ({error: {message: "rate limited"}}) });
    await assert.rejects(grokGenerate("Reglas", "Pregunta"), (error) => {
      assert.match(error.message, /HTTP 429/);
      assert.ok(!error.message.includes("private-test-secret"));
      return true;
    });
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.GROK_API_KEY; else process.env.GROK_API_KEY = oldKey;
  }
});
