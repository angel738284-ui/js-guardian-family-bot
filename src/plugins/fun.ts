import { sendText } from "../bot/client.ts";
import { config } from "../config.ts";
import { command } from "../core/command.ts";
import { endTicTacToe, getTicTacToe, renderBoard, startQuiz, startTicTacToe } from "../features/games.ts";
import { ANIME_REACTIONS, MATH_LEVELS } from "../lib/constants.ts";
import { personFor } from "../lib/ctx.ts";
import { gifToMp4 } from "../lib/effects.ts";
import { mentionTag } from "../lib/jid.ts";
import { mathQuestion } from "../lib/quiz.ts";
import { animeImage, fact, getBytes, joke } from "../lib/web.ts";

command({
  name: "tictactoe",
  aliases: ["ttt"],
  description: "Play tic-tac-toe against someone in this chat",
  category: "tools",
  usage: "@opponent | end",
  run: async (ctx) => {
    if (ctx.args.toLowerCase() === "end") {
      await ctx.reply(endTicTacToe(ctx.chat) ? "Game ended." : "No game running here.");
      return;
    }
    if (getTicTacToe(ctx.chat)) {
      await ctx.replyFail(`A game is already running. End it with \`${config.prefix}ttt end\`.`);
      return;
    }
    const opponent = personFor(ctx);
    if (!opponent || opponent === ctx.sender) {
      await ctx.replyFail(`Mention or reply to your opponent: \`${config.prefix}ttt @friend\``);
      return;
    }
    const game = startTicTacToe(ctx.chat, ctx.sender, opponent);
    await ctx.reply(
      `*Tic-tac-toe*\n❌ ${mentionTag(ctx.sender)} vs ⭕ ${mentionTag(opponent)}\n\n${renderBoard(game)}\n\n${mentionTag(ctx.sender)} starts: send a number 1-9.`,
      { mentions: [ctx.sender, opponent] },
    );
  },
});

command({
  name: "math",
  aliases: ["quiz"],
  description: "Quick math quiz: first right answer wins",
  category: "tools",
  usage: `[${Object.keys(MATH_LEVELS).join(" | ")}]`,
  run: async (ctx) => {
    const level = MATH_LEVELS[ctx.args.toLowerCase()] ? ctx.args.toLowerCase() : "easy";
    const { question, answer, seconds } = mathQuestion(level);
    startQuiz(ctx.chat, question, answer, seconds, () => void sendText(ctx.chat, `⏰ Time's up! *${question} = ${answer}*`).catch(() => {}));
    await ctx.reply(`🧮 *${question} = ?*\n_${seconds} seconds, ${level}_`);
  },
});

// One command per anime reaction: #hug, #slap, #pat, ...
for (const kind of ANIME_REACTIONS) {
  command({
    name: kind,
    description: `Send an anime ${kind} GIF`,
    category: "tools",
    usage: "[@user | reply]",
    run: async (ctx) => {
      const target = ctx.target();
      const gif = await ctx.withTyping(async () => gifToMp4((await getBytes(await animeImage(kind))).bytes));
      const caption = target ? `${mentionTag(ctx.sender)} ${kind}s ${mentionTag(target)}` : `${mentionTag(ctx.sender)} ${kind}s`;
      await ctx.send({ type: "video", media: gif, mimetype: "video/mp4", gifPlayback: true, caption }, { mentions: [ctx.sender, ...(target ? [target] : [])] });
    },
  });
}

command({
  name: "neko",
  aliases: ["waifu", "husbando", "kitsune"],
  description: "Random SFW anime picture",
  category: "tools",
  run: async (ctx) => {
    const image = await getBytes(await animeImage(ctx.command === "neko" ? "neko" : ctx.command));
    await ctx.send({ type: "image", media: image.bytes, mimetype: image.type || "image/png" });
  },
});

command({
  name: "joke",
  description: "A random joke",
  category: "tools",
  run: async (ctx) => {
    await ctx.reply(await joke());
  },
});

command({
  name: "fact",
  description: "A random fun fact",
  category: "tools",
  run: async (ctx) => {
    await ctx.reply(`💡 ${await fact()}`);
  },
});
