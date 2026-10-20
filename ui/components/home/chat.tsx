import type { ReactNode } from "react";

export type ChatItem =
  | { kind: "system"; text: string }
  | { kind: "user"; name: string; text: string; image?: boolean }
  | { kind: "bot"; text: ReactNode }
  | { kind: "poll"; question: string; options: [string, number][] }
  | { kind: "sticker"; text: string }
  | { kind: "typing" };

export function ChatBubble({ item }: { item: ChatItem }) {
  switch (item.kind) {
    case "system":
      return (
        <div className="flex justify-center">
          <span className="rounded-full bg-surface-2 px-3 py-1 text-center font-mono text-[11px] text-muted">{item.text}</span>
        </div>
      );
    case "user":
      return (
        <div className="max-w-[82%] rounded-2xl rounded-tl-md bg-surface-2 px-3.5 py-2.5">
          <p className="text-[12px] font-medium text-fg">{item.name}</p>
          {item.image && (
            <div className="mt-2 flex aspect-[4/3] w-44 items-end rounded-xl bg-[radial-gradient(120%_90%_at_30%_20%,#3f3f46,#18181b)] p-2">
              <span className="font-mono text-[10px] text-muted">IMG_2041.jpg</span>
            </div>
          )}
          <p className="mt-0.5 whitespace-pre-line text-[14px] leading-snug text-fg/90">{item.text}</p>
        </div>
      );
    case "bot":
      return (
        <div className="max-w-[82%] rounded-2xl rounded-tl-md border border-border-strong bg-black px-3.5 py-2.5">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-fg">
            Asena
            <span className="rounded bg-fg px-1 font-mono text-[9px] font-semibold uppercase tracking-wider text-black">bot</span>
          </p>
          <div className="mt-0.5 text-[14px] leading-snug text-fg/90">{item.text}</div>
        </div>
      );
    case "poll": {
      const total = item.options.reduce((sum, [, votes]) => sum + votes, 0) || 1;
      return (
        <div className="w-[82%] rounded-2xl rounded-tl-md bg-surface-2 px-3.5 py-3">
          <p className="text-[12px] font-medium text-fg">Poll</p>
          <p className="mt-1 text-[14px] font-medium text-fg">{item.question}</p>
          <ul className="mt-3 space-y-2.5">
            {item.options.map(([label, votes]) => (
              <li key={label}>
                <div className="flex justify-between text-[13px] text-fg/90">
                  <span>{label}</span>
                  <span className="font-mono text-muted">{votes}</span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-black">
                  <div className="h-full rounded-full bg-fg transition-[width] duration-700" style={{ width: `${(votes / total) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "sticker":
      return (
        <div className="flex h-28 w-28 rotate-[-4deg] items-center justify-center rounded-[22px] border-4 border-white bg-[radial-gradient(100%_100%_at_30%_20%,#52525b,#0a0a0a)] shadow-xl">
          <span className="font-serif text-3xl italic text-white">{item.text}</span>
        </div>
      );
    case "typing":
      return (
        <div className="typing inline-flex gap-1 rounded-2xl rounded-tl-md border border-border-strong px-3.5 py-3">
          <span className="h-1.5 w-1.5 rounded-full bg-fg" />
          <span className="h-1.5 w-1.5 rounded-full bg-fg" />
          <span className="h-1.5 w-1.5 rounded-full bg-fg" />
        </div>
      );
  }
}

export function ChatFrame({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[28px] border border-border bg-surface shadow-[0_0_0_1px_rgb(255_255_255/0.02),0_40px_120px_-40px_rgb(255_255_255/0.08)]">
      <div className="flex items-center gap-3 border-b border-border px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 font-mono text-xs text-fg">
          {title
            .split(" ")
            .map((word) => word[0])
            .slice(0, 2)
            .join("")}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{title}</p>
          <p className="truncate text-xs text-muted">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}
