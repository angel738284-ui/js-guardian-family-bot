import { MATH_LEVELS } from "./constants.ts";

// A random sum for #math; division always comes out whole.
export function mathQuestion(level: string): { question: string; answer: number; seconds: number } {
  const settings = MATH_LEVELS[level] ?? MATH_LEVELS.easy!;
  const pick = (max: number) => Math.floor(Math.random() * max) + 1;
  const op = settings.ops[Math.floor(Math.random() * settings.ops.length)]!;
  let a = pick(settings.max);
  const b = pick(op === "*" ? Math.ceil(settings.max / 4) : settings.max);

  if (op === "/") {
    a = a * b;
    return { question: `${a} ÷ ${b}`, answer: a / b, seconds: settings.seconds };
  }
  const answer = op === "+" ? a + b : op === "-" ? a - b : a * b;
  return { question: `${a} ${op === "*" ? "×" : op} ${b}`, answer, seconds: settings.seconds };
}
