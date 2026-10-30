import { command } from "../core/command.ts";
import { epinAccount,epinLatamProducts,hasEpinbyKey,purchasesEnabled } from "../features/epinbyApi.ts";
import {
  prepareEpinOrder,formatDraft,confirmEpinOrder,cancelEpinDraft,
  getEpinDraft,refreshEpinOrder,getLastEpinOrder,formatEpinStatus
} from "../features/epinbyOrders.ts";
import type { Ctx } from "../core/context.ts";
import { isJSLeader } from "../features/ai/leaderIdentity.ts";

async function guard(ctx:Ctx):Promise<boolean> {
  if (!isJSLeader(ctx)) return false;
  if (!hasEpinbyKey()) {
    await ctx.reply("🔐 Epinby todavía no está vinculado. Regenerá las claves expuestas y guardá la nueva como EPINBY_API_KEY en Render.");
    return false;
  }
  return true;
}
async function onError(ctx:Ctx,error:unknown):Promise<void> {
  await ctx.reply("⚠️ "+(error instanceof Error?error.message:"Falló la consulta a Epinby."));
}

command({
  name:"cargar",category:"owner",permission:"owner",
  description:"Preparar compra de diamantes Free Fire LATAM sin cobrar todavía",
  usage:"<ID Free Fire> <110|341|572|1166|2398|6160>",
  run:async(ctx)=>{
    if (!await guard(ctx)) return;
    const [id,quantity,...extra]=ctx.args.trim().split(/\s+/);
    if (!id || !quantity || extra.length>0 || !/^\d{6,15}$/.test(id) || !/^\d{2,5}$/.test(quantity)) {
      await ctx.reply("💎 Usá */cargar 11572310927 110*. Cantidades: 110, 341, 572, 1166, 2398, 6160 (también acepta 5600).");
      return;
    }
    try {
      const draft=await prepareEpinOrder(id,Number(quantity),ctx.chat);
      await ctx.reply(formatDraft(draft));
    } catch(error) { await onError(ctx,error); }
  },
});

command({
  name:"confirmarcarga",category:"owner",permission:"owner",
  description:"Autorizar cobro desde la billetera Epinby",
  run:async(ctx)=>{
    if (!await guard(ctx)) return;
    if (!purchasesEnabled()) {
      await ctx.reply("🔒 Compras todavía desactivadas. La API está preparada, pero falta habilitar la ejecución en Render.");
      return;
    }
    try {
      const order=await confirmEpinOrder(ctx.chat);
      await ctx.reply("✅ Pedido recibido por Epinby.\n"+formatEpinStatus(order));
    } catch(error) { await onError(ctx,error); }
  },
});

command({
  name:"cancelarcarga",category:"owner",permission:"owner",
  description:"Descartar una orden de recarga sin confirmar",
  run:async(ctx)=>{
    if (!await guard(ctx)) return;
    try { await cancelEpinDraft(ctx.chat); await ctx.reply("🧹 Recarga preparada cancelada. No se gastó saldo."); }
    catch(error) { await onError(ctx,error); }
  },
});

command({
  name:"estadocarga",category:"owner",permission:"owner",
  description:"Consultar el último pedido o una confirmación pendiente",
  run:async(ctx)=>{
    if (!await guard(ctx)) return;
    try {
      const draft=await getEpinDraft();
      if (draft && draft.chat!==ctx.chat) {
        await ctx.reply("🔒 Hay un pedido pendiente en otro chat; consultalo ahí.");
        return;
      }
      if (draft && draft.state!=="ready") {
        await ctx.reply("⚠️ Hay una compra de estado *"+draft.state+"*. No vuelvas a enviarla. Revisá el historial de Epinby manualmente, o hablá con soporte.");
        return;
      }
      if (draft && draft.state==="ready") {
        await ctx.reply(formatDraft(draft));
        return;
      }
      const last=await getLastEpinOrder();
      if (!last) { await ctx.reply("Todavía no hay pedidos registrados en JS Guardian."); return; }
      await ctx.reply(formatEpinStatus(await refreshEpinOrder()));
    } catch(error) { await onError(ctx,error); }
  },
});

command({
  name:"saldoepinby",category:"owner",permission:"owner",
  description:"Consultar saldo del proveedor Epinby en USD",
  run:async(ctx)=>{
    if (!await guard(ctx)) return;
    if (ctx.isGroup) { await ctx.reply("🔒 Para ver tu saldo, escribime /saldoepinby por privado."); return; }
    try {
      const account=await epinAccount();
      await ctx.reply("💵 *Saldo Epinby:* "+account.balance+" "+account.currency+
        "\n"+(purchasesEnabled()?"🟢 Compras habilitadas.":"🔒 Compras todavía bloqueadas."));
    } catch(error) { await onError(ctx,error); }
  },
});

command({
  name:"catalogoepin",category:"owner",permission:"owner",
  description:"Paquetes Free Fire LATAM disponibles y precio mayorista",
  run:async(ctx)=>{
    if (!await guard(ctx)) return;
    try {
      const items=await epinLatamProducts();
      await ctx.reply("💎 *Epinby · Free Fire LATAM*\n"+
        (items.length?items.map(p=>"• "+p.name+" — "+p.price+" USD").join("\n"):
          "No se encontraron paquetes. Verificá el catálogo o la categoría LATAM.")+
        "\n\nEstos son costos del proveedor, no tus precios de venta.");
    } catch(error) { await onError(ctx,error); }
  },
});
