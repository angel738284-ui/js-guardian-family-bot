/** Epinby Public API; all calls originate on the server, never in WhatsApp or the APK. */
const BASE = "https://www.epinby.com/api/v1";
export interface EpinProduct {
  id:number; name:string; game?:string; category?:string; type:string; price:string;
  stock_status?:string; stock_count?:number; supports_player_validation?:boolean;
}
export interface EpinAccount {balance:string;currency:string}
export interface EpinPlayer {
  nickname?:string;player_name?:string;region?:string;
  nickname_verified?:boolean;validation_optional?:boolean;
}
export interface EpinOrder {
  order_id:number;status:string;price?:string;player_id?:string;
  client_order_id?:string;player_name?:string;region?:string;
}
interface Envelope<T> {success:boolean;data?:T;error?:{code?:string;message?:string}}

export function hasEpinbyKey(): boolean {
  return Boolean(process.env.EPINBY_API_KEY?.trim());
}
export function purchasesEnabled(): boolean {
  return process.env.EPINBY_PURCHASES_ENABLED === "true";
}

async function call<T>(path:string, method:"GET"|"POST"="GET", body?:unknown, idem?:string):Promise<T> {
  const key=process.env.EPINBY_API_KEY?.trim();
  if (!key) throw new Error("Falta EPINBY_API_KEY en Render. Regenerá primero las claves expuestas.");
  const headers:Record<string,string> = {"X-API-KEY":key,"Accept":"application/json"};
  if (body) headers["Content-Type"]="application/json";
  if (idem) headers["X-Idempotency-Key"]=idem;
  let response:Response;
  try {
    response=await fetch(BASE+path,{method,headers,
      ...(body ? {body:JSON.stringify(body)} : {}),
      signal:AbortSignal.timeout(20_000)});
  } catch {
    throw new Error("No hubo respuesta de Epinby. Si era una compra, verificá antes de reintentar.");
  }
  const json=await response.json().catch(()=>null) as Envelope<T>|null;
  if (!response.ok || !json || json.success!==true || json.data===undefined) {
    const errorCode=json?.error?.code ?? (response.status ? String(response.status) : "DESCONOCIDO");
    const safeCodes=["INSUFFICIENT_FUNDS","VALIDATION_REQUIRED","IDEMPOTENCY_CONFLICT","VALIDATION_ERROR","ORDER_NOT_FOUND","SERVICE_ERROR","SERVICE_DISABLED"];
    const code=safeCodes.includes(errorCode) ? errorCode : "HTTP "+response.status;
    throw new Error("Epinby rechazó la solicitud ("+code+"). Revisá la cuenta o el catálogo.");
  }
  return json.data;
}

export async function epinAccount():Promise<EpinAccount> {
  return call<EpinAccount>("/getMe");
}
export function epinPrice(value:string|number):number {
  const s=String(value);
  if (!/^\d{1,5}(?:\.\d{1,4})?$/.test(s)) throw new Error("Epinby devolvió un precio inválido.");
  const amount=Number(s);
  if (!(amount>0 && amount<1000)) throw new Error("El precio del proveedor está fuera del límite.");
  return amount;
}

const packs=[110,341,572,1166,2398,6160] as const;
export function requestedSku(amount:number):number {
  return amount===5600 ? 6160 : amount;
}
export async function epinLatamProducts():Promise<EpinProduct[]> {
  const params="?type=topup&category="+encodeURIComponent("Freefire LATAM")+"&per_page=100";
  const body=await call<EpinProduct[]>( "/products"+params );
  if (!Array.isArray(body)) throw new Error("No se pudo obtener el catálogo LATAM.");
  return body.filter(p =>
    String(p.type).toUpperCase()==="TOPUP" &&
    /latam/i.test(String(p.category)) &&
    /free.?fire/i.test(String(p.category)+" "+String(p.game ?? "")) &&
    Number.isSafeInteger(p.id) && p.id>0
  );
}
export function selectEpinProduct(products:EpinProduct[],requestedAmount:number):EpinProduct {
  const amount=requestedSku(requestedAmount);
  if (!packs.includes(amount as typeof packs[number]))
    throw new Error("Paquete no admitido. Elegí 110, 341, 572, 1166, 2398 o 6160.");
  const matches=products.filter(p=>{
    const m=p.name.trim().match(/^(\d+)\s*(?:diamonds?|diamantes?)\b/i);
    return m && Number(m[1])===amount;
  });
  if (matches.length!==1) throw new Error("Ese paquete no está disponible en el catálogo LATAM de Epinby.");
  const p=matches[0]!;
  if (p.stock_status?.toUpperCase()==="OUT_OF_STOCK" ||
      p.stock_status?.toUpperCase()==="SOLD_OUT" ||
      (p.stock_status?.toUpperCase()==="FINITE" && p.stock_count===0))
    throw new Error("El paquete está agotado en Epinby.");
  epinPrice(p.price);
  return p;
}
export async function epinValidate(productId:number,playerId:string):Promise<EpinPlayer> {
  return call<EpinPlayer>("/validate-player","POST",{product_id:productId,player_id:playerId});
}
export function validateEpinPlayer(player:EpinPlayer):void {
  if (player.nickname_verified!==true)
    throw new Error("Epinby no confirmó el nombre del ID. No voy a preparar una compra sin verificarlo.");
  const region=String(player.region ?? "").toUpperCase().trim();
  if (region && !["SAC","LATAM","LA","SA","AR","ARGENTINA","SOUTH AMERICA"].includes(region))
    throw new Error("La región del ID no coincide con Free Fire LATAM ("+region+").");
}
export async function epinCreateOrder(productId:number,playerId:string,idempotencyKey:string):Promise<EpinOrder> {
  if (!purchasesEnabled()) throw new Error("Las compras siguen desactivadas en Render.");
  return call<EpinOrder>("/order","POST",{product_id:productId,qty:1,player_id:playerId},idempotencyKey);
}
export async function epinOrderStatus(orderId:number):Promise<EpinOrder> {
  if (!Number.isSafeInteger(orderId) || orderId<=0) throw new Error("Número de pedido inválido.");
  return call<EpinOrder>("/order/"+orderId);
}
