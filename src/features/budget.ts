import { kv } from "../db/kv.ts";

export interface BudgetEntry {
  kind: "income" | "expense";
  amount: number;
  note: string;
  at: number;
}

const key = (user: string) => `budget:${user}`;

export async function getEntries(user: string): Promise<BudgetEntry[]> {
  return (await kv.get<BudgetEntry[]>(key(user))) ?? [];
}

export async function addEntry(user: string, entry: BudgetEntry): Promise<void> {
  await kv.set(key(user), [...(await getEntries(user)), entry]);
}

export async function removeEntry(user: string, index: number): Promise<BudgetEntry | null> {
  const entries = await getEntries(user);
  const [removed] = entries.splice(index, 1);
  if (!removed) return null;
  await kv.set(key(user), entries.length ? entries : null);
  return removed;
}

export async function clearEntries(user: string): Promise<void> {
  await kv.delete(key(user));
}
