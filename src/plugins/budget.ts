import { config } from "../config.ts";
import { command } from "../core/command.ts";
import { addEntry, clearEntries, getEntries, removeEntry, type BudgetEntry } from "../features/budget.ts";
import { formatMoney, parseAmount } from "../lib/args.ts";
import { senderKey } from "../lib/ctx.ts";

function entryCommand(kind: BudgetEntry["kind"], aliases: string[]) {
  command({
    name: kind,
    aliases,
    description: `Record ${kind === "income" ? "money in" : "money spent"}`,
    category: "tools",
    usage: "<amount> [note]",
    run: async (ctx) => {
      const [first = "", ...rest] = ctx.args.split(/\s+/);
      const amount = parseAmount(first);
      if (!amount) {
        await ctx.replyFail(`Usage: \`${config.prefix}${kind} 5000 ${kind === "income" ? "salary" : "food"}\``);
        return;
      }
      await addEntry(senderKey(ctx), { kind, amount, note: rest.join(" "), at: Date.now() });
      await ctx.replyOk(`${kind === "income" ? "Income" : "Expense"} of ${formatMoney(amount)} saved.`);
    },
  });
}

entryCommand("income", ["earn"]);
entryCommand("expense", ["spend", "spent"]);

command({
  name: "budget",
  aliases: ["summary"],
  description: "Your income, expenses and balance",
  category: "tools",
  usage: "[month]",
  run: async (ctx) => {
    const entries = await getEntries(senderKey(ctx));
    const monthOnly = ctx.args.toLowerCase() === "month";
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const shown = monthOnly ? entries.filter((entry) => entry.at >= start.getTime()) : entries;
    if (shown.length === 0) {
      await ctx.reply(`No entries yet. Add some with \`${config.prefix}income\` and \`${config.prefix}expense\`.`);
      return;
    }

    const total = (kind: BudgetEntry["kind"]) => shown.filter((entry) => entry.kind === kind).reduce((sum, entry) => sum + entry.amount, 0);
    const income = total("income");
    const expense = total("expense");
    const recent = shown.slice(-10).map((entry) => {
      const index = entries.indexOf(entry) + 1;
      return `${index}. ${entry.kind === "income" ? "➕" : "➖"} ${formatMoney(entry.amount)}${entry.note ? ` · ${entry.note}` : ""} _(${new Date(entry.at).toLocaleDateString()})_`;
    });

    await ctx.reply(
      `*Budget${monthOnly ? " this month" : ""}*\n` +
        `Income: ${formatMoney(income)}\nExpenses: ${formatMoney(expense)}\n*Balance: ${formatMoney(income - expense)}*\n\n` +
        `*Latest*\n${recent.join("\n")}\n\n_Remove one with \`${config.prefix}delbudget <number>\`._`,
    );
  },
});

command({
  name: "delbudget",
  description: "Remove a budget entry, or all of them",
  category: "tools",
  usage: "<number> | all",
  run: async (ctx) => {
    if (ctx.args.toLowerCase() === "all") {
      await clearEntries(senderKey(ctx));
      await ctx.replyOk("All budget entries removed.");
      return;
    }
    const removed = await removeEntry(senderKey(ctx), Number(ctx.args) - 1);
    if (!removed) {
      await ctx.replyFail(`Usage: \`${config.prefix}delbudget 3\` (numbers from \`${config.prefix}budget\`)`);
      return;
    }
    await ctx.replyOk(`Removed ${removed.kind} of ${formatMoney(removed.amount)}.`);
  },
});
