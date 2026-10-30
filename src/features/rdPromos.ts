/**
 * Consulta de promociones PagoStore RD (PayPal, moneda DOP).
 * Solo lectura: NO crea compras ni envía pagos.
 * Reutiliza exactamente el endpoint Volsever del proyecto JS Recargas.
 */
export interface RdDiscountItem {
  diamonds?: number;
  bonus_diamonds?: number;
  price?: number;
  original_price?: number;
  discount_amount?: number;
  is_discount?: boolean;
}
export interface RdPromoSnapshot {
  userId: string;
  nickname: string;
  region: string;
  items: RdDiscountItem[];
  cached: boolean;
}

export const RD_PACKAGES = [110, 341, 572, 1166, 2398, 5600] as const;
export const RD_PROMO_PRICES: Record<number, number> = {
  110: 1300, 341: 3600, 572: 6200, 1166: 12500, 2398: 24000, 5600: 53500,
};
export const RD_REGULAR_PRICES: Record<number, number> = {
  110: 1500, 341: 4500, 572: 8400, 1166: 15000, 2398: 25000, 5600: 60000,
};

const API_URL = "https://gate.volsever.com/garena/api/v1/pagostore/free-fire/check-discounts-paypal-dom";
const CACHE_MS = 10 * 60 * 1000;
const LIMIT = 80;
const cache = new Map<string, { until: number; result: RdPromoSnapshot }>();
const pending = new Map<string, Promise<RdPromoSnapshot>>();
let lastRemoteRequest = 0;

export function rdPackageFromItem(item: RdDiscountItem): number | null {
  const base = Number(item.diamonds ?? 0);
  const total = base + Number(item.bonus_diamonds ?? 0);
  if (base === 5600 || total === 6160) return 5600;
  return RD_PACKAGES.includes(total as typeof RD_PACKAGES[number]) ? total : null;
}

export function hasRdPromo(items: RdDiscountItem[], pack: number): boolean {
  return items.some((item) => item.is_discount === true && rdPackageFromItem(item) === pack);
}

export function formatRdPromos(data: RdPromoSnapshot): string {
  const formatMoney = (value: number) => "$" + new Intl.NumberFormat("es-AR").format(value);
  const lines = [
    "🔥 *PROMOCIONES · JS RECARGAS*",
    `👤 ${data.nickname || "Nombre no disponible"}`,
    `🆔 ${data.userId}`,
    `🌎 Región: ${data.region || "No informada"}`,
    "",
  ];
  if (data.region && data.region.toUpperCase() !== "SAC") {
    lines.push("⚠️ ID de otra región. Verificá que sea compatible con las promociones.", "");
  }
  for (const pack of RD_PACKAGES) {
    const active = hasRdPromo(data.items, pack);
    const price = active ? RD_PROMO_PRICES[pack]! : RD_REGULAR_PRICES[pack]!;
    lines.push(`💎 ${pack} — ${active ? "✅ PROMO" : "❌ Sin promo"} — ${formatMoney(price)}`);
  }
  lines.push("", "💵 Precios JS Recargas en pesos argentinos (ARS).");
  lines.push("ℹ️ Solo consulta; no realiza recargas.");
  if (data.cached) lines.push("🕒 Resultado en caché (máx. 10 minutos).");
  return lines.join("\n");
}

export async function consultRdPromos(id: string): Promise<RdPromoSnapshot> {
  if (!/^\d{6,15}$/.test(id)) throw new Error("ID inválido. Usá /promo 11572310927.");
  const key = process.env.VOLSEVER_API_KEY?.trim();
  if (!key) throw new Error("Falta configurar VOLSEVER_API_KEY en Render → Environment.");
  const previous = cache.get(id);
  if (previous && previous.until > Date.now()) return { ...previous.result, cached: true };
  const outstanding = pending.get(id);
  if (outstanding) return outstanding;
  if (Date.now() - lastRemoteRequest < 15_000) {
    throw new Error("Esperá 15 segundos antes de consultar otro ID para cuidar la cuota de la API.");
  }
  lastRemoteRequest = Date.now();
  const query = (async (): Promise<RdPromoSnapshot> => {
    let response: Response;
    try {
      response = await fetch(`${API_URL}?id=${encodeURIComponent(id)}`, {
        method: "GET",
        headers: { "Accept": "application/json", "X-API-Key": key },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error("No se pudo conectar con Volsever. Probá nuevamente.");
    }
    if (response.status === 401) throw new Error("Volsever rechazó la API key (401).");
    if (response.status === 402) throw new Error("Volsever requiere saldo o plan activo (402).");
    if (response.status === 403) throw new Error("La API no está habilitada para tu cuenta (403).");
    if (response.status === 404) throw new Error("No se encontró ese ID en la consulta de promociones.");
    if (response.status === 429) throw new Error("Se alcanzó el límite de consultas a Volsever (429).");
    if (!response.ok) throw new Error(`Volsever no respondió correctamente (HTTP ${response.status}).`);
    let raw: unknown;
    try { raw = await response.json(); }
    catch { throw new Error("Respuesta inválida de Volsever."); }
    const envelope = raw as { status?: boolean; message?: string; data?: Record<string, unknown> };
    if (!envelope || envelope.status === false) throw new Error("La API no pudo verificar ese ID.");
    const fields = envelope.data && typeof envelope.data === "object" ? envelope.data : raw as Record<string, unknown>;
    if (!Array.isArray(fields.discount_items)) throw new Error("La API no devolvió el listado de promociones.");
    const result: RdPromoSnapshot = {
      userId: typeof fields.user_id === "string" ? fields.user_id : id,
      nickname: typeof fields.username === "string" ? fields.username : "",
      region: typeof fields.region === "string" ? fields.region : "",
      items: fields.discount_items as RdDiscountItem[],
      cached: false,
    };
    if (result.userId !== id) throw new Error("La API devolvió un ID distinto al solicitado.");
    if (cache.size >= LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(id, { until: Date.now() + CACHE_MS, result });
    return result;
  })();
  pending.set(id, query);
  try { return await query; }
  finally { pending.delete(id); }
}

/** Lista pública de precios JS Recargas (ARS), separada de la verificación por ID. */
export function formatJsPriceLists(): string {
  const money = (value: number) => "$" + new Intl.NumberFormat("es-AR").format(value);
  return [
    "💎 *RECARGAS JS · PRECIOS*",
    "",
    "🔥 *PRECIOS CON PROMOS*",
    ...RD_PACKAGES.map(pack => "💎 " + pack + " — " + money(RD_PROMO_PRICES[pack]!)),
    "",
    "— Recargas JS —",
    "",
    "💵 *PRECIOS SIN PROMOS*",
    ...RD_PACKAGES.map(pack => "💎 " + pack + " — " + money(RD_REGULAR_PRICES[pack]!)),
    "",
    "— Recargas JS —",
    "",
    "ℹ️ La tarifa promocional se aplica solo a los paquetes que tengan promoción activa para el ID.",
    "🔎 El administrador puede comprobarlo con /promo ID.",
  ].join("\n");
}
