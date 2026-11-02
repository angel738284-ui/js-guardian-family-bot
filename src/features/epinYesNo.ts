import type { Ctx } from "../core/context.ts";
import { isOwner } from "./access.ts";
import { isJSLeader } from "./ai/leaderIdentity.ts";
import { confirmEpinOrder, cancelEpinDraft, getEpinDraft, formatEpinStatus } from "./epinbyOrders.ts";
import { hasEpinbyKey, purchasesEnabled } from "./epinbyApi.ts";

export async function handleEpinYesNo(ctx:Ctx):Promise<boolean>{
 const answer=ctx.text.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
 if(answer!=="si"&&answer!=="no")return false;
 if(!isOwner(ctx)&&!isJSLeader(ctx))return false;
 const draft=await getEpinDraft();
 if(!draft||draft.chat!==ctx.chat||draft.state!=="ready")return false;
 // Un 'sí' o 'no' aislado no debe comprar si el mensaje no es una respuesta
 // al presupuesto del bot: evita compras accidentales en una conversación.
 const quote=ctx.message.quoted;
 if(!quote||!(/RECARGA PREPARADA|PEDIDO PREPARADO/i.test(quote.text)))return false;
 if(!hasEpinbyKey()){await ctx.reply("⚠️ Epinby no está configurado.");return true;}
 if(answer==="no"){
  try{await cancelEpinDraft(ctx.chat);await ctx.reply("❌ Recarga cancelada. No se gastó saldo.");}
  catch(e){await ctx.reply("⚠️ "+(e instanceof Error?e.message:"No se pudo cancelar."));}
  return true;
 }
 if(!purchasesEnabled()){await ctx.reply("🔒 Las compras están desactivadas en Render.");return true;}
 try{
  const order=await confirmEpinOrder(ctx.chat);
  await ctx.reply("✅ Pedido recibido por Epinby.\n"+formatEpinStatus(order,ctx.isGroup));
 }catch(e){await ctx.reply("⚠️ "+(e instanceof Error?e.message:"No se pudo confirmar."));}
 return true;
}
