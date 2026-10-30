import { command } from "../core/command.ts";
import { isJSLeader } from "../features/ai/leaderIdentity.ts";
import {
  ADMIN_SIMPLE_COMMANDS, adminCommandsEnabled, setAdminCommandsEnabled,
} from "../features/adminSimpleCommands.ts";

command({
  name: "adminscomandos",
  category: "owner",
  permission: "owner",
  groupOnly: true,
  description: "Permitir o bloquear comandos básicos para administradores del grupo",
  usage: "on|off",
  run: async (ctx) => {
    if (!isJSLeader(ctx)) return;
    const arg = ctx.args.trim().toLowerCase();
    if (arg === "on" || arg === "off") {
      await setAdminCommandsEnabled(ctx.chat, arg === "on");
      await ctx.replyOk("Comandos básicos para administradores: *" +
        (arg === "on" ? "ACTIVOS" : "DESACTIVADOS") + "*.");
      return;
    }
    const enabled = await adminCommandsEnabled(ctx.chat);
    await ctx.reply("🛡️ *Comandos para administradores*\nEstado: *" +
      (enabled ? "ACTIVOS" : "DESACTIVADOS") + "*\n" +
      "Permitidos: /reglas, /precios, .torneos, /warn, /unwarn, /warnings y /links.\n" +
      "🔐 No incluye compras, saldo, confirmaciones, desbaneos ni configuración.\n" +
      "Usá */adminscomandos on* o */adminscomandos off*.");
  },
});
