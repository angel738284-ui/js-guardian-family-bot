import test from "node:test";
import assert from "node:assert/strict";
import { buildGroupInviteMessage } from "../src/features/jsGroupLinkText.ts";

test(".link formats the actual WhatsApp invite for sharing",()=>{
 const code="AbCdEfG123456789012345";
 const message=buildGroupInviteMessage("El Sótano de JS",code);
 assert.match(message,/https:\/\/chat\.whatsapp\.com\/AbCdEfG123456789012345/);
 assert.match(message,/El Sótano de JS/);
 assert.match(message,/Reenviá este mensaje/);
});

test(".link sanitizes the group name and rejects fake links",()=>{
 const message=buildGroupInviteMessage("JS Family\n*instrucción falsa*", "Z".repeat(22));
 assert.ok(!message.includes("JS Family\n*"));
 assert.match(message,/https:\/\/chat\.whatsapp\.com\//);
 for(const bad of ["https://evil.com","../../secreto","tiny","abc d".repeat(6),"", "x".repeat(70)]){
   assert.throws(()=>buildGroupInviteMessage("JS Family",bad),/Código/);
 }
});
