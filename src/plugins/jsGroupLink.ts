import { command } from "../core/command.ts";
import { handleGroupLink } from "../features/jsGroupLink.ts";

command({
  name: "link",
  description: "Publicar el enlace de invitación del grupo actual para compartir",
  category: "group",
  groupOnly: true,
  adminOnly: true,
  usage: "(sin argumentos)",
  run: async ctx => { await handleGroupLink(ctx); },
});
