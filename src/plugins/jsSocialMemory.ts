import { command } from "../core/command.ts";
import { handleSocialMemoryCommand } from "../features/ai/socialMemoryCommand.ts";

// Included in .cmds; the main handler also routes this specific command
// before the owner-only conversation path so every member can use their own memory.
command({
  name:"memoria",
  description:"Memoria social voluntaria V3: apodos, gustos y anécdotas de Free Fire",
  category:"tools",
  usage:"on|off|guardar TEXTO|gusto TEXTO|anecdota TEXTO|apodo NOMBRE|ver|borrar N",
  run: async ctx => { await handleSocialMemoryCommand(ctx); },
});
