"use client";

import { useState } from "react";
import { ChatBubble, ChatFrame, type ChatItem } from "./chat";

interface UseCase {
  id: string;
  label: string;
  title: [string, string];
  text: string;
  jobs: [string, string][];
  chat: { title: string; subtitle: string; items: ChatItem[] };
}

const CASES: UseCase[] = [
  {
    id: "communities",
    label: "Communities",
    title: ["Keep big groups", "civil"],
    text: "Greet every new member, remove link spam and repeat offenders, and settle decisions with a poll instead of 200 replies.",
    jobs: [
      ["Welcome and goodbye messages", "#welcome on"],
      ["Delete links and spam automatically", "#antilink on"],
      ["Warnings that end in a kick", "#warn @user"],
      ["Polls and event invites", "#poll"],
    ],
    chat: {
      title: "Estate Residents",
      subtitle: "412 members",
      items: [
        { kind: "user", name: "Bisi", text: "#warn @Femi stop posting ads" },
        { kind: "bot", text: "@Femi warned (2/3). One more and you are removed." },
        { kind: "system", text: "Femi was removed after 3 warnings" },
      ],
    },
  },
  {
    id: "creators",
    label: "Creators",
    title: ["Post once,", "reach everyone"],
    text: "Turn clips into stickers with your own pack name, post statuses from a command, and send an announcement to every group you run.",
    jobs: [
      ["Stickers with your pack name", "#sticker"],
      ["Statuses with colors and fonts", "#story"],
      ["Announce to all your groups", "#broadcast"],
      ["Invite cards for your community", "#invite"],
    ],
    chat: {
      title: "Studio Notes",
      subtitle: "you and Asena",
      items: [
        { kind: "user", name: "You", text: "#story --color purple New episode out tonight at 8" },
        { kind: "bot", text: "✓ Status posted to 1,204 contacts. #story undo deletes it." },
      ],
    },
  },
  {
    id: "teams",
    label: "Teams",
    title: ["Never miss a", "deadline"],
    text: "Reminders that fire in the right chat, shared notes everyone can pull up, and an AI that summarises the thread you missed.",
    jobs: [
      ["Reminders in any chat", "#remind"],
      ["Notes on demand", "#note get"],
      ["Ask Meta AI", "#ai"],
      ["Mention everyone at once", "#mention"],
    ],
    chat: {
      title: "Ops Team",
      subtitle: "9 members",
      items: [
        { kind: "user", name: "Ngozi", text: "#remind mon 9am invoice for Adebayo & Co" },
        { kind: "bot", text: "✓ Reminder set for Monday, 09:00" },
        { kind: "system", text: "Monday 09:00" },
        { kind: "bot", text: "Reminder · invoice for Adebayo & Co" },
      ],
    },
  },
  {
    id: "personal",
    label: "Just you",
    title: ["A pocket", "toolbox"],
    text: "Save a song from YouTube, turn a video into audio, hear a message read aloud, or keep private notes, all without leaving WhatsApp.",
    jobs: [
      ["YouTube to audio or video", "#ytmp3"],
      ["Video to MP3", "#tomp3"],
      ["Text to voice note", "#tts"],
      ["Private notes", "#note"],
    ],
    chat: {
      title: "Asena",
      subtitle: "private chat",
      items: [
        { kind: "user", name: "You", text: "#ytmp3 rema calm down" },
        { kind: "bot", text: "Calm Down · 3:59 · downloading…" },
        { kind: "bot", text: "▶ calm-down.mp3 · 3.6 MB" },
      ],
    },
  },
];

export function UseCases() {
  const [active, setActive] = useState(CASES[0]!.id);
  const current = CASES.find((entry) => entry.id === active)!;

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Use cases">
        {CASES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={entry.id === active}
            onClick={() => setActive(entry.id)}
            className={`h-10 rounded-full px-5 text-sm transition-colors ${
              entry.id === active ? "bg-fg font-medium text-black" : "border border-border text-muted hover:text-fg"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div key={current.id} className="rise mt-12 grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <h3 className="text-4xl font-semibold tracking-[-0.035em] text-fg sm:text-5xl">
            {current.title[0]} <span className="font-serif font-normal italic">{current.title[1]}</span>
          </h3>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">{current.text}</p>
          <ul className="mt-10 divide-y divide-border border-y border-border">
            {current.jobs.map(([job, cmd]) => (
              <li key={job} className="flex items-center justify-between gap-4 py-4">
                <span className="text-fg">{job}</span>
                <code className="shrink-0 font-mono text-sm text-muted">{cmd}</code>
              </li>
            ))}
          </ul>
        </div>
        <ChatFrame title={current.chat.title} subtitle={current.chat.subtitle}>
          <div className="flex min-h-[300px] flex-col justify-end gap-3 px-5 pb-5 pt-6">
            {current.chat.items.map((item, index) => (
              <div key={index} className="flex flex-col items-start">
                <ChatBubble item={item} />
              </div>
            ))}
          </div>
        </ChatFrame>
      </div>
    </div>
  );
}
