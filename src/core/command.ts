import type { Ctx } from "./context.ts";

export type Category = "misc" | "info" | "group" | "admin" | "media" | "owner";

export type Permission = "everyone" | "sudo" | "owner";

export interface Command {
  name: string;
  aliases?: string[];
  description: string;
  category: Category;
  usage?: string;

  permission?: Permission;
  groupOnly?: boolean;
  adminOnly?: boolean;
  botAdmin?: boolean;
  flag?: string;
  audit?: boolean;
  hidden?: boolean;

  run: (ctx: Ctx) => Promise<void>;
}

const commands: Command[] = [];
const byName = new Map<string, Command>();

export function command(definition: Command): void {
  const names = [definition.name, ...(definition.aliases ?? [])].map((name) => name.toLowerCase());

  for (const name of names) {
    if (byName.has(name)) {
      throw new Error(`Command name "${name}" is registered twice.`);
    }
  }

  commands.push(definition);
  for (const name of names) byName.set(name, definition);
}

export function findCommand(name: string): Command | undefined {
  return byName.get(name.toLowerCase());
}

export function allCommands(): readonly Command[] {
  return commands;
}

export function menuCommands(): Command[] {
  return commands.filter((cmd) => !cmd.hidden).sort((a, b) => a.name.localeCompare(b.name));
}

export function splitCommand(text: string, prefix: string): { name: string; args: string } | null {
  if (!text.startsWith(prefix)) return null;

  const rest = text.slice(prefix.length).trimStart();
  const match = rest.match(/^(\S+)([\s\S]*)$/);
  if (!match) return null;

  return { name: match[1]!.toLowerCase(), args: match[2]!.trim() };
}
