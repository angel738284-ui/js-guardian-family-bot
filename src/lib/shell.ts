import type { Subprocess } from "bun";

// Terminal commands started with #sh, by chat.
export const runningShells = new Map<string, Subprocess>();
