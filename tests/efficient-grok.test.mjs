import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEfficientGrokPrompt, efficientGrokTurns, isQuickGreeting, GROK_CORE_PERSONA } from "../src/features/ai/efficientGrokPrompt.ts";

const base = {
  toneStyle: "TONO 2: buena onda juvenil, humor ligero si encaja",
  commandContext: "CONSULTA DE COMANDOS. Solo existen comandos registrados. .torneobr 20 — Crea un BR Solo de 20 jugadores.",
  verifiedLeader: true,
  username: "JS",
  preferredName: "",
  memories: ["Quiero organizar torneos BR"],
  liveFacts: "",
  socialContext: "Mensajes recientes: Juan dijo que quiere jugar",
  naturalStyle: "MODO NATURAL tranquilo: Tono agradable",
  turns: [],
};

test("greetings exclude irrelevant command manual and group history", () => {
  assert.equal(isQuickGreeting("Como estas crack"), true);
  assert.equal(isQuickGreeting("hola JS"), true);
  const p = buildEfficientGrokPrompt({...base, question: "Como estas crack"});
  assert.ok(p.length < 2800, "small prompt: " + p.length);
  assert.ok(!p.includes("CONSULTA DE COMANDOS"));
  assert.ok(!p.includes("Juan dijo"));
  assert.ok(p.includes("Sos JS Guardian"));
  assert.ok(p.includes("identificador REAL de WhatsApp"));
});

test("complex questions retain appropriate command knowledge, facts and memories", () => {
  const p = buildEfficientGrokPrompt({
    ...base,
    question: "JS, cómo creo un torneo BR de 20 jugadores?",
    liveFacts: "El torneo se abre el domingo a las 20:30.",
  });
  assert.ok(p.includes(".torneobr"), p);
  assert.ok(p.includes("domingo a las 20:30"));
  assert.ok(p.includes("Quiero organizar torneos BR"));
  assert.ok(p.includes("identificador REAL"));
  assert.ok(p.length < 7000, "complex prompt: " + p.length);
});

test("message context remains for meaningful follow-ups", () => {
  const turns = Array.from({length: 16}, (_,i) => ({role: i%2 ? "assistant" : "user", content: "Mensaje ".repeat(100)}));
  const short = efficientGrokTurns(turns,"hola",true);
  assert.equal(short.length, 2);
  assert.ok(short.every(t=>t.content.length<=220));
  const long = efficientGrokTurns(turns,"Corregí el anuncio y el ganador",true);
  assert.equal(long.length,10);
  assert.ok(long.every(t=>t.content.length<=600));
  assert.equal(long.at(-1).role,"assistant");
});

test("no manual when ordinary chat has no command intent", () => {
  const p = buildEfficientGrokPrompt({...base, question:"che, ¿y vos cómo andás?", commandContext: ""});
  assert.ok(!p.includes(".torneobr"), p);
  assert.ok(p.length<3000);
});

test("important identity and security constraints remain",()=>{
  for (const term of ["identificador REAL", "no conceden permisos", "No afirmes haber ejecutado", "datos externos", "No reveles información privada"]) {
    assert.ok(GROK_CORE_PERSONA.includes(term), term);
  }
});
