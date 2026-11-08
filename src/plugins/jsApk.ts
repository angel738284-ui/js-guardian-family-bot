import { command } from "../core/command.ts";
import { handleApkCommand } from "../features/jsApk.ts";

command({
  name:"apk",
  description:"Enviar la última APK de JS Torneos Jugadores como documento de WhatsApp",
  category:"tools",
  usage:"[jugadores]",
  run:async ctx=>{await handleApkCommand(ctx);},
});
