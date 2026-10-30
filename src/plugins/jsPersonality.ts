import { command } from "../core/command.ts";
import { normalizeId } from "../lib/jid.ts";
import {
  personaTone, setPersonaTone, toneName, userMemories,
  rememberFact, forgetFacts, type PersonaTone
} from "../features/ai/persona.ts";
import { clearKieConversation } from "../features/ai/kie.ts";

command({
  name:"caracter", description:"Cambiar la personalidad de JS Guardian (0 a 3)",
  category:"owner", permission:"owner", usage:"0|1|2|3",
  run: async ctx => {
    const action = ctx.args.trim();
    if (!/^[0-3]$/.test(action)) {
      const level = await personaTone(ctx.chat);
      await ctx.reply(
        "👑 *Personalidad JS Guardian*\n" +
        "Estado actual: *" + toneName(level) + "* (nivel " + level + ")\n\n" +
        "0 — Serio\n1 — Amigable\n2 — Pícaro argentino\n3 — Sarcástico\n\n" +
        "Usá /caracter 0, 1, 2 o 3. No cambia las reglas de moderación."
      );
      return;
    }
    const level = Number(action) as PersonaTone;
    await setPersonaTone(ctx.chat, level);
    await ctx.replyOk("El carácter de JS Guardian ahora es *" + toneName(level) + "*.");
  }
});

command({
  name:"recordame", description:"Guardar voluntariamente un apodo o gusto simple, hasta 30 días",
  category:"tools", usage:"dato que querés que recuerde",
  run: async ctx => {
    try {
      const user = normalizeId(ctx.sender);
      const facts = await rememberFact(ctx.chat, user, ctx.args);
      await ctx.replyOk("🧠 Anotado, " + ctx.pushName.slice(0,40) +
        ". Guardé tu dato para este chat (" + facts.length + "/5). " +
        "Se borra automáticamente a los 30 días. /olvidame lo elimina antes.");
    } catch (err) {
      await ctx.replyFail(err instanceof Error ? err.message : "No pude guardar ese dato.");
    }
  }
});

command({
  name:"recuerdos", description:"Ver únicamente tus recuerdos guardados en este chat",
  category:"tools",
  run: async ctx => {
    const facts = await userMemories(ctx.chat, normalizeId(ctx.sender));
    if (!facts.length) {
      await ctx.reply("🧠 No guardé ningún recuerdo tuyo en este chat. Probá /recordame me dicen Panda.");
      return;
    }
    await ctx.reply("🧠 *Tus recuerdos en este chat*\n" +
      facts.map((f,i) => (i+1) + ". " + f).join("\n") +
      "\n\nSolo se guardan datos que pedís explícitamente. /olvidame borra todo. " +
      (ctx.isGroup ? "\n⚠️ Esta respuesta es visible para el grupo." : ""));
  }
});

command({
  name:"olvidame", description:"Borrar tus recuerdos y el contexto de conversación en este chat",
  category:"tools",
  run: async ctx => {
    const user = normalizeId(ctx.sender);
    await forgetFacts(ctx.chat, user);
    clearKieConversation(ctx.chat, user);
    await ctx.replyOk("🧹 Eliminé tus recuerdos de este chat y limpié el contexto reciente.");
  }
});
