import { kv } from "../../db/kv.ts";

const key=(user:string)=>"js:player:preferred_name:"+user;
const clean=(value:string)=>value.trim().replace(/[.!?,;:]+$/,"").trim();
const valid=(name:string)=>name.length>=2&&name.length<=28&&/^[\p{L}\p{M}0-9 _'-]+$/u.test(name)&&!/(?:soy|me llamo|mi nombre|guardian|bot|hola|gracias|quiero|tengo)/i.test(name);
export async function savedPlayerName(user:string):Promise<string|null>{
 const name=await kv.get<string>(key(user));
 return typeof name==="string"&&valid(name)?name:null;
}
export async function updatePlayerName(user:string,message:string):Promise<{name:string|null;changed:boolean}>{
 const input=message.trim();
 if (/^(?:(?:guardian|js guardian|bot)[,!: ]*)?(?:olvid[aá] mi nombre|no recuerdes mi nombre|borr[aá] mi nombre|no me llames por mi nombre)[.! ]*$/i.test(input)){
  await kv.delete(key(user));return {name:null,changed:true};
 }
 const match=input.match(/^(?:(?:hola|buenas|hey|guardian|js guardian|bot)[,!: ]*)?(?:soy|me llamo|mi nombre es|llamame|ll[aá]mame|decime)\s+(.+?)\s*[.!]?$/i);
 if(match){
  const name=clean(match[1]!);
  if(valid(name)){await kv.set(key(user),name);return {name,changed:true};}
 }
 return {name:await savedPlayerName(user),changed:false};
}
