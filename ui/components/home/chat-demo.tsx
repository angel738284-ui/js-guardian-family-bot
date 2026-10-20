"use client";

import { useEffect, useState } from "react";
import { ChatBubble, ChatFrame, type ChatItem } from "./chat";

type Step = { at: number; item: ChatItem; replaceTyping?: boolean };

const SCRIPT: Step[] = [
  { at: 400, item: { kind: "system", text: "Tolu joined using the invite link" } },
  { at: 1200, item: { kind: "typing" } },
  {
    at: 2300,
    replaceTyping: true,
    item: {
      kind: "bot",
      text: (
        <>
          Welcome <b>@Tolu</b> to Lagos Runners Club. You are member 128. Saturday runs start 6:00 at Lekki Phase 1.
        </>
      ),
    },
  },
  { at: 4300, item: { kind: "user", name: "Kemi", text: "cheap sneakers here bit.ly/3xKp9" } },
  { at: 5300, item: { kind: "system", text: "Message deleted · links are off here" } },
  { at: 7000, item: { kind: "user", name: "Dami", text: "#poll Saturday route? | Lekki loop | Ikoyi bridge | Yaba" } },
  { at: 8000, item: { kind: "poll", question: "Saturday route?", options: [["Lekki loop", 12], ["Ikoyi bridge", 31], ["Yaba", 6]] } },
  { at: 10200, item: { kind: "user", name: "Ada", text: "#remind fri 9pm pack water and gels" } },
  { at: 10900, item: { kind: "typing" } },
  { at: 11600, replaceTyping: true, item: { kind: "bot", text: "✓ Reminder set for Friday, 21:00" } },
  { at: 13300, item: { kind: "user", name: "Seyi", text: "#sticker", image: true } },
  { at: 14100, item: { kind: "typing" } },
  { at: 14900, replaceTyping: true, item: { kind: "sticker", text: "PR!" } },
];

const LOOP_MS = 19_000;
const MAX_VISIBLE = 6;

export function ChatDemo() {
  const [items, setItems] = useState<{ id: number; item: ChatItem }[]>([]);

  useEffect(() => {
    let timers: ReturnType<typeof setTimeout>[] = [];
    let id = 0;

    const play = () => {
      timers = [setTimeout(() => setItems([]), 0)];
      timers.push(...SCRIPT.map((step) =>
        setTimeout(() => {
          setItems((current) => {
            const base = step.replaceTyping ? current.filter((entry) => entry.item.kind !== "typing") : current;
            return [...base, { id: id++, item: step.item }].slice(-MAX_VISIBLE);
          });
        }, step.at),
      ));
      timers.push(setTimeout(play, LOOP_MS));
    };

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const still = SCRIPT.filter((step) => step.item.kind !== "typing").slice(-MAX_VISIBLE);
      const timer = setTimeout(() => setItems(still.map((step, index) => ({ id: index, item: step.item }))), 0);
      return () => clearTimeout(timer);
    }
    play();
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <ChatFrame title="Lagos Runners Club" subtitle="128 members · Asena is an admin">
      <div className="flex h-[440px] flex-col justify-end gap-3 overflow-hidden px-4 pb-5 [mask-image:linear-gradient(to_bottom,transparent,black_18%)] sm:px-5" aria-label="Example group chat run by Asena">
        {items.map(({ id, item }) => (
          <div key={id} className="rise flex flex-col items-start">
            <ChatBubble item={item} />
          </div>
        ))}
      </div>
    </ChatFrame>
  );
}
