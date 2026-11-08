import { kv } from "../../db/kv.ts";
import { addSocialFact, formatSocialFactsForAI, validSocialFacts, type SocialMemoryProfile, type SocialFactKind, type SocialFact } from "./socialMemoryCore.ts";

const key=(chat:string,user:string):string => "js:v3:social_memory:"+chat+":"+user;

export async function getSocialMemoryProfile(chat:string,user:string):Promise<SocialMemoryProfile|null>{
  if(!chat||!user)return null;
  const stored=await kv.get<SocialMemoryProfile>(key(chat,user));
  if(!stored || stored.enabled!==true)return null;
  const facts=validSocialFacts(stored.facts);
  if(facts.length!==(Array.isArray(stored.facts)?stored.facts.length:0)){
    await kv.set(key(chat,user),{enabled:true,startedAt:Number(stored.startedAt)||Date.now(),facts});
  }
  return {enabled:true,startedAt:Number(stored.startedAt)||Date.now(),facts};
}

export async function enableSocialMemory(chat:string,user:string):Promise<SocialMemoryProfile>{
  if(!chat||!user)throw new Error("No pude identificar tu usuario.");
  const previous=await getSocialMemoryProfile(chat,user);
  const profile:SocialMemoryProfile=previous??{enabled:true,startedAt:Date.now(),facts:[]};
  await kv.set(key(chat,user),profile);
  return profile;
}

export async function disableSocialMemory(chat:string,user:string):Promise<void>{
  if(!chat||!user)return;
  await kv.delete(key(chat,user));
}

export async function saveSocialMemory(chat:string,user:string,kind:SocialFactKind,text:string):Promise<SocialFact[]>{
  const profile=await getSocialMemoryProfile(chat,user);
  if(!profile)throw new Error("Activá primero tu memoria social con *.memoria on*. Nada se guarda automáticamente.");
  const facts=addSocialFact(profile.facts,kind,text);
  await kv.set(key(chat,user),{...profile,facts});
  return facts;
}

export async function deleteSocialMemoryFact(chat:string,user:string,index:number):Promise<SocialFact[]>{
  const profile=await getSocialMemoryProfile(chat,user);
  if(!profile)throw new Error("Tu memoria social no está activada.");
  if(!Number.isInteger(index)||index<1||index>profile.facts.length)
    throw new Error("Elegí un número de tu lista. Consultala con *.memoria ver*.");
  const facts=profile.facts.filter((_,i)=>i!==index-1);
  await kv.set(key(chat,user),{...profile,facts});
  return facts;
}

export async function clearSocialMemoryFacts(chat:string,user:string):Promise<void>{
  const profile=await getSocialMemoryProfile(chat,user);
  if(!profile)return;
  await kv.set(key(chat,user),{...profile,facts:[]});
}

export async function socialMemoryContext(chat:string,user:string,question:string):Promise<string>{
  const profile=await getSocialMemoryProfile(chat,user);
  if(!profile)return "";
  return formatSocialFactsForAI(profile.facts,question);
}
