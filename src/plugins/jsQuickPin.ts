import { command } from "../core/command.ts";
import { handleQuickPin } from "../features/quickPin.ts";

command({
  name:"f",
  description:"Fijar por 7 días el mensaje al que respondés en el grupo",
  category:"group",
  groupOnly:true,
  adminOnly:true,
  usage:"(responder al mensaje y escribir .f)",
  run:async ctx=>{await handleQuickPin(ctx);},
});
