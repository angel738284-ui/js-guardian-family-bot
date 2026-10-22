import { kv } from "../db/kv.ts";

export interface GroupStats {
  since: number;
  total: number;
  members: Record<string, { name: string; count: number }>;
}

const FLUSH_MS = 60_000;
const pending = new Map<string, Map<string, { name: string; count: number }>>();
let timer: ReturnType<typeof setInterval> | null = null;

const statsKey = (group: string) => `gstats:${group}`;

export async function getGroupStats(group: string): Promise<GroupStats> {
  await flushGroupStats();
  return (await kv.get<GroupStats>(statsKey(group))) ?? { since: Date.now(), total: 0, members: {} };
}

export async function resetGroupStats(group: string): Promise<void> {
  pending.delete(group);
  await kv.delete(statsKey(group));
}

// Counts in memory and writes once a minute, so busy groups do not hit the database per message.
export function countGroupMessage(group: string, member: string, name: string): void {
  let members = pending.get(group);
  if (!members) pending.set(group, (members = new Map()));
  const entry = members.get(member) ?? { name, count: 0 };
  entry.count++;
  if (name) entry.name = name;
  members.set(member, entry);
  timer ??= setInterval(() => void flushGroupStats(), FLUSH_MS);
}

export async function flushGroupStats(): Promise<void> {
  const batches = [...pending.entries()];
  pending.clear();
  for (const [group, members] of batches) {
    const stats = (await kv.get<GroupStats>(statsKey(group))) ?? { since: Date.now(), total: 0, members: {} };
    for (const [member, { name, count }] of members) {
      const current = stats.members[member] ?? { name, count: 0 };
      stats.members[member] = { name: name || current.name, count: current.count + count };
      stats.total += count;
    }
    await kv.set(statsKey(group), stats);
  }
}
