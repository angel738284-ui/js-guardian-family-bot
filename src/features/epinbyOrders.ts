import { randomUUID } from "node:crypto";
import { kv } from "../db/kv.ts";
import {
  epinAccount,epinLatamProducts,epinPrice,epinValidate,
  selectEpinProduct,validateEpinPlayer,epinCreateOrder,
  epinOrderStatus,purchasesEnabled,type EpinOrder,
} from "./epinbyApi.ts";

const DRAFT_KEY="epinby:purchase:draft";
const LAST_KEY="epinby:purchase:last";
const DRAFT_TTL=5*60_000;

export interface Draft {
  state:"ready"|"submitting"|"uncertain";
  playerId:string;pack:number;productId:number;productName:string;
  amountUsd:number;currency:string;nickname:string;region:string;
  idempotencyKey:string;createdAt:number;
}
export interface LastOrder {
  orderId:number;playerId:string;pack:number;status:string;amountUsd:number;currency:string;
  createdAt:number;
}
const money=(v:number)=>v.toFixed(4)+" USD";
export const formatDraft=(d:Draft)=>
  "💎 *RECARGA PREPARADA · EPINBY*\n"+
  "👤 "+d.nickname+"\n"+
  "🆔 "+d.playerId+"\n"+
  "🌎 Región: "+(d.region||"No informada")+"\n"+
  "📦 "+d.productName+"\n"+
  "💰 *Costo proveedor:* "+money(d.amountUsd)+"\n"+
  "🧾 Producto #"+d.productId+"\n\n"+
  "⚠️ *Todavía NO se compró nada.*\n"+
  "Para gastar tu saldo: */confirmarcarga*\n"+
  "Para anular: */cancelarcarga*\n"+
  "La autorización vence en cinco minutos.";

export const getEpinDraft=()=>kv.get<Draft>(DRAFT_KEY);
export const getLastEpinOrder=()=>kv.get<LastOrder>(LAST_KEY);

export async function prepareEpinOrder(playerId:string,pack:number):Promise<Draft> {
  if (!/^\d{6,15}$/.test(playerId)) throw new Error("ID inválido: usá entre 6 y 15 dígitos.");
  const existing=await getEpinDraft();
  if (existing && existing.state!=="ready")
    throw new Error("Existe una compra que puede estar en proceso. Revisá /estadocarga antes de empezar otra.");
  const products=await epinLatamProducts();
  const product=selectEpinProduct(products,pack);
  const [account,player]=await Promise.all([
    epinAccount(),epinValidate(product.id,playerId),
  ]);
  validateEpinPlayer(player);
  const usd=epinPrice(product.price);
  if (String(account.currency).toUpperCase()!=="USD")
    throw new Error("Epinby usa una moneda distinta a USD. Revisá el tipo de cambio antes de comprar.");
  if (Number(account.balance)<usd)
    throw new Error("Saldo insuficiente en Epinby. Necesitás "+money(usd)+".");
  const draft:Draft={
    state:"ready",playerId,pack,productId:product.id,productName:product.name,
    amountUsd:usd,currency:"USD",
    nickname:String(player.nickname||player.player_name||"Jugador verificado").slice(0,70),
    region:String(player.region||"").slice(0,30),idempotencyKey:randomUUID(),createdAt:Date.now(),
  };
  await kv.set(DRAFT_KEY,draft);
  return draft;
}

let submitting=false;
export async function confirmEpinOrder():Promise<LastOrder> {
  if (submitting) throw new Error("Hay una compra en curso. No la repitas.");
  if (!purchasesEnabled()) throw new Error("Compras desactivadas por seguridad. Falta activar EPINBY_PURCHASES_ENABLED en Render.");
  submitting=true;
  try {
    const draft=await getEpinDraft();
    if (!draft) throw new Error("No hay recarga preparada. Usá /cargar ID CANTIDAD.");
    if (draft.state!=="ready")
      throw new Error("La operación podría haberse enviado. Consultá /estadocarga o el panel Epinby.");
    if (Date.now()-draft.createdAt>DRAFT_TTL)
      throw new Error("La confirmación venció. Usá /cancelarcarga y prepará una nueva.");
    // Revalidar el precio del proveedor: podría haber cambiado después del presupuesto.
    const products=await epinLatamProducts();
    const product=products.find(p=>p.id===draft.productId);
    if (!product || Number(epinPrice(product.price).toFixed(4))!==Number(draft.amountUsd.toFixed(4)))
      throw new Error("Cambió el catálogo o el precio. Cancelá y volvé a preparar la recarga.");
    const account=await epinAccount();
    if (String(account.currency).toUpperCase()!=="USD" || Number(account.balance)<draft.amountUsd)
      throw new Error("Saldo insuficiente o moneda inesperada en Epinby.");
    draft.state="submitting";
    // Estado persistido ANTES de la llamada. Ante timeout, nunca duplicar la compra.
    await kv.set(DRAFT_KEY,draft);
    let result:EpinOrder;
    try {
      result=await epinCreateOrder(draft.productId,draft.playerId,draft.idempotencyKey);
    } catch {
      draft.state="uncertain";
      await kv.set(DRAFT_KEY,draft);
      throw new Error("Epinby no confirmó la compra. NO la repitas: revisá pedidos en Epinby o contactá soporte.");
    }
    if (!Number.isSafeInteger(result.order_id)||result.order_id<=0) {
      draft.state="uncertain";
      await kv.set(DRAFT_KEY,draft);
      throw new Error("Epinby no devolvió número de pedido. NO la repitas sin verificar el panel.");
    }
    const last:LastOrder={
      orderId:result.order_id,playerId:draft.playerId,pack:draft.pack,
      status:String(result.status||"PENDING"),amountUsd:draft.amountUsd,
      currency:draft.currency,createdAt:Date.now(),
    };
    await kv.set(LAST_KEY,last);
    await kv.delete(DRAFT_KEY);
    return last;
  } finally {
    submitting=false;
  }
}

export async function cancelEpinDraft():Promise<void> {
  const draft=await getEpinDraft();
  if (!draft) throw new Error("No hay ninguna recarga pendiente.");
  if (draft.state!=="ready")
    throw new Error("El pedido puede estar en trámite. Consultá /estadocarga; no puedo cancelarlo desde WhatsApp.");
  await kv.delete(DRAFT_KEY);
}
export async function refreshEpinOrder():Promise<LastOrder> {
  const last=await getLastEpinOrder();
  if (!last) throw new Error("Todavía no hay pedidos registrados. Si hubo un timeout, revisá Epinby.");
  const latest=await epinOrderStatus(last.orderId);
  last.status=String(latest.status||last.status);
  await kv.set(LAST_KEY,last);
  return last;
}
export function formatEpinStatus(o:LastOrder):string {
  const status=o.status.toUpperCase();
  const label=status==="COMPLETED"?"✅ ENTREGADA":
    status==="FAILED"||status==="CANCELED"?"❌ FALLIDA / CANCELADA":"⏳ "+status;
  return "💎 *PEDIDO EPINBY*\n🧾 #"+o.orderId+
    "\n🆔 "+o.playerId+"\n📦 "+o.pack+" diamantes"+
    "\n💰 Costo: "+money(o.amountUsd)+"\nEstado: *"+label+"*"+
    (status==="COMPLETED"?"\n✅ Epinby informó entrega completada.":
      "\nℹ️ Consultá luego con /estadocarga. No hagas otra compra duplicada.");
}
