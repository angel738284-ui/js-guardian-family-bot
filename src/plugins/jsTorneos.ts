import { command } from "../core/command.ts";
import { loadPublicTournaments, formatPublicTournaments } from "../features/jsTorneosPublic.ts";

command({
  name:"torneos",description:"Torneos JS abiertos, cupos y enlaces de inscripción",category:"tools",
  run:async(ctx)=>{
    try { await ctx.reply(formatPublicTournaments(await loadPublicTournaments())); }
    catch { await ctx.reply("⚠️ No pude consultar JS Torneos ahora. Probá de nuevo en unos minutos."); }
  },
});
