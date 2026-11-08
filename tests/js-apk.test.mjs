import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {pickApkSource,safeApkAssetUrl,validateApkBytes,handleApkCommand} from "../src/features/jsApk.ts";

const url="https://github.com/angel738284-ui/js-torneos/releases/download/test/JS-TORNEOS-JUGADORES-v1.7.0.apk";
test("only official JS Torneos Jugadores release assets qualify",()=>{
  const source=pickApkSource({assets:[
    {name:"JS-TORNEOS-v0.6.6.apk",browser_download_url:"https://github.com/angel738284-ui/js-torneos/releases/download/test/JS-TORNEOS-v0.6.6.apk",size:99000},
    {name:"JS-TORNEOS-JUGADORES-v1.7.0.apk",browser_download_url:url,size:250000,digest:"sha256:"+"a".repeat(64)}
  ]});
  assert.equal(source.name,"JS-TORNEOS-JUGADORES-v1.7.0.apk");
  assert.equal(source.sha256,"a".repeat(64));
  assert.equal(safeApkAssetUrl(source.name,"https://attacker.example/app.apk"),false);
  assert.equal(safeApkAssetUrl("JS-TORNEOS-v0.6.6.apk",url),false);
  assert.equal(safeApkAssetUrl(source.name,url),true);
  assert.equal(pickApkSource({assets:[]}),null);
});
test("APK magic, size and exact sha256 required",()=>{
  const bytes=new Uint8Array(11000);
  bytes.set([80,75,3,4],0);
  const checksum=createHash("sha256").update(bytes).digest("hex");
  validateApkBytes(bytes,{name:"JS-TORNEOS-JUGADORES-v1.7.0.apk",url,sha256:checksum});
  assert.throws(()=>validateApkBytes(bytes,{name:"x",url,sha256:"b".repeat(64)}),/integridad/);
  bytes[0]=0;
  assert.throws(()=>validateApkBytes(bytes,{name:"x",url,sha256:null}),/APK válido/);
});
test("document sent to WhatsApp with APK MIME, using the current official release",async()=>{
  const old=globalThis.fetch;
  const bytes=new Uint8Array(16000);bytes.set([80,75,3,4],0);
  const checksum=createHash("sha256").update(bytes).digest("hex");
  let calls=0;
  let sent=null;
  globalThis.fetch=async (requested)=>{
    calls++;
    if(String(requested).endsWith("/releases/latest"))return {ok:true,json:async()=>({assets:[{name:"JS-TORNEOS-JUGADORES-v1.7.0.apk",browser_download_url:url,digest:"sha256:"+checksum,size:bytes.length}]})};
    assert.equal(requested,url);
    return {ok:true,url,headers:new Headers({"content-length":String(bytes.length)}),body:new ReadableStream({start(ctrl){ctrl.enqueue(bytes);ctrl.close();}})};
  };
  const ctx={
    command:"apk",args:"",sender:"unit-test-user-010",chat:"test-group-020",
    withTyping:async fn=>fn(),
    send:async data=>{sent=data;},
    reply:async message=>{throw new Error("Unexpected reply: "+message);},
  };
  try {
    assert.equal(await handleApkCommand(ctx),true);
    assert.equal(calls,2);
    assert.equal(sent?.type,"document");
    assert.equal(sent?.fileName,"JS-TORNEOS-JUGADORES-v1.7.0.apk");
    assert.equal(sent?.mimetype,"application/vnd.android.package-archive");
    assert.equal(sent?.media.byteLength,bytes.byteLength);
    assert.match(sent?.caption,/jstorneos.com/);
  } finally {globalThis.fetch=old;}
});
