import type { Ctx } from "../core/context.ts";
import { mentionTag, normalizeId } from "../lib/jid.ts";

const GAME_TTL_MS = 10 * 60_000;
const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];
const CELL = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"];

export interface TicTacToe {
  players: [string, string];
  board: ("X" | "O" | null)[];
  turn: 0 | 1;
  expires: number;
}

export interface MathQuiz {
  question: string;
  answer: number;
  timer: ReturnType<typeof setTimeout>;
}

const ticTacToe = new Map<string, TicTacToe>();
const quizzes = new Map<string, MathQuiz>();

export function renderBoard(game: TicTacToe): string {
  const cells = game.board.map((mark, i) => (mark === "X" ? "❌" : mark === "O" ? "⭕" : CELL[i]));
  return [cells.slice(0, 3), cells.slice(3, 6), cells.slice(6, 9)].map((row) => row.join("")).join("\n");
}

function winner(board: TicTacToe["board"]): "X" | "O" | null {
  for (const [a, b, c] of LINES) {
    if (board[a!] && board[a!] === board[b!] && board[a!] === board[c!]) return board[a!]!;
  }
  return null;
}

export function getTicTacToe(chat: string): TicTacToe | undefined {
  const game = ticTacToe.get(chat);
  if (game && game.expires < Date.now()) ticTacToe.delete(chat);
  return ticTacToe.get(chat);
}

export function startTicTacToe(chat: string, playerX: string, playerO: string): TicTacToe {
  const game: TicTacToe = { players: [playerX, playerO], board: Array(9).fill(null), turn: 0, expires: Date.now() + GAME_TTL_MS };
  ticTacToe.set(chat, game);
  return game;
}

export function endTicTacToe(chat: string): boolean {
  return ticTacToe.delete(chat);
}

export function startQuiz(chat: string, question: string, answer: number, seconds: number, onTimeout: () => void): void {
  clearTimeout(quizzes.get(chat)?.timer);
  const timer = setTimeout(() => {
    quizzes.delete(chat);
    onTimeout();
  }, seconds * 1000);
  quizzes.set(chat, { question, answer, timer });
}

async function playTicTacToe(ctx: Ctx, game: TicTacToe): Promise<boolean> {
  const move = Number(ctx.text.trim());
  if (!Number.isInteger(move) || move < 1 || move > 9) return false;
  const current = game.players[game.turn];
  if (!ctx.senderIds.includes(normalizeId(current))) return false;

  if (game.board[move - 1]) {
    await ctx.reply("That square is taken. Pick another.");
    return true;
  }
  game.board[move - 1] = game.turn === 0 ? "X" : "O";
  game.expires = Date.now() + GAME_TTL_MS;

  const won = winner(game.board);
  const full = game.board.every(Boolean);
  if (won || full) {
    ticTacToe.delete(ctx.chat);
    const result = won ? `🏆 ${mentionTag(current)} wins!` : "🤝 It's a draw!";
    await ctx.reply(`${renderBoard(game)}\n\n${result}`, { mentions: [...game.players] });
    return true;
  }

  game.turn = game.turn === 0 ? 1 : 0;
  const next = game.players[game.turn];
  await ctx.reply(`${renderBoard(game)}\n\n${mentionTag(next)}'s turn (${game.turn === 0 ? "❌" : "⭕"})`, { mentions: [next] });
  return true;
}

async function answerQuiz(ctx: Ctx, quiz: MathQuiz): Promise<boolean> {
  const guess = Number(ctx.text.trim());
  if (!Number.isFinite(guess) || ctx.text.trim() === "") return false;
  if (guess !== quiz.answer) {
    await ctx.react("❌");
    return true;
  }
  clearTimeout(quiz.timer);
  quizzes.delete(ctx.chat);
  await ctx.reply(`✅ ${mentionTag(ctx.sender)} got it: *${quiz.answer}*`, { mentions: [ctx.sender] });
  return true;
}

// Moves and answers for running games. Returns true when the message was part of a game.
export async function runGames(ctx: Ctx): Promise<boolean> {
  if (!ctx.text) return false;
  const game = getTicTacToe(ctx.chat);
  if (game && (await playTicTacToe(ctx, game))) return true;
  const quiz = quizzes.get(ctx.chat);
  return quiz ? answerQuiz(ctx, quiz) : false;
}
