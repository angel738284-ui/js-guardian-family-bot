import test from "node:test";
import assert from "node:assert/strict";
import { PURGA_RULES, formatPurgaRules, formatPurgaAnnouncement } from "../src/features/purgaRules.ts";
import { groupRulesInfo } from "../src/features/groupRulesInfo.ts";

async function responseFor(text) {
  const sent=[];
  const answered=await groupRulesInfo({text,reply:async message=>{sent.push(message);}});
  return {answered,sent};
}

test(".reglas purga sends nine official Purga rules with the forgiveness exception",async()=>{
  const r=await responseFor(".reglas purga");
  assert.equal(r.answered,true);
  assert.equal(r.sent.length,1);
  assert.equal(PURGA_RULES.length,9);
  for(const rule of PURGA_RULES)assert.ok(r.sent[0].includes(rule),rule);
  for(const detail of ["30 segundos","primera zona","segunda zona","0 de daño","Solo JS","Se permite campear"]){
    assert.ok(r.sent[0].includes(detail),detail);
  }
  assert.doesNotMatch(r.sent[0],/quien use uno queda eliminado/i);
});

test(".reglas alone preserves standard group rules",async()=>{
  const r=await responseFor(".reglas");
  assert.equal(r.answered,true);
  assert.equal(r.sent.length,1);
  assert.match(r.sent[0],/REGLAS DEL GRUPO FREE FIRE/);
  assert.match(r.sent[0],/Nada de contenido para adultos/);
  assert.doesNotMatch(r.sent[0],/REGLAS OFICIALES — LA PURGA DE JS/);
});

test("non-rule messages are not intercepted",async()=>{
  assert.deepEqual(await responseFor("hola"),{answered:false,sent:[]});
});

test("Purga event announcement and standalone rules use same nine rules",()=>{
  const standalone=formatPurgaRules();
  const event=formatPurgaAnnouncement("20:30");
  assert.match(event,/20:30 hs/);
  assert.match(event,/INSCRIPCIONES/);
  assert.match(event,/🏆 \*GANADOR:\*/);
  for(const rule of PURGA_RULES){
    assert.ok(standalone.includes(rule),rule);
    assert.ok(event.includes(rule),rule);
  }
  assert.doesNotMatch(event,/Prohibido usar emotes: quien use uno queda eliminado/i);
});
