import test from "node:test";
import assert from "node:assert/strict";
import { quickPinPayload } from "../src/features/quickPinMessage.ts";
import { PIN_SECONDS } from "../src/lib/constants.ts";

test(".f pins the exact replied-to message, not the chat", () => {
  const target={remoteJid:"123456789@g.us",id:"3EB0ABC0123",fromMe:false,participant:"5491122223333@s.whatsapp.net"};
  const pin=quickPinPayload(target);
  assert.deepEqual(pin,{type:"pin",target,durationSecs:PIN_SECONDS});
  assert.equal(pin.durationSecs,7*24*60*60);
});

test(".f rejects invocation without a valid quoted message", () => {
  assert.throws(()=>quickPinPayload(null),/Respondé al mensaje/);
  assert.throws(()=>quickPinPayload({id:"",remoteJid:"123@g.us",fromMe:false}),/Respondé al mensaje/);
  assert.throws(()=>quickPinPayload({id:"123",remoteJid:"",fromMe:false}),/Respondé al mensaje/);
});
