import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import { ChatDemo } from "@/components/home/chat-demo";
import { CommandTicker } from "@/components/home/command-ticker";
import { HomeStats } from "@/components/home/home-stats";
import { UseCases } from "@/components/home/use-cases";
import { site } from "@/lib/site";

const steps = [
  ["Scan", "Open asena.fun/pair and scan the code with the phone that will run Asena."],
  ["Paste", "You get one session ID. Paste it into your settings, or into Render with one click."],
  ["Start", "Run Asena. It loads its login from the session ID and gets to work, wherever it runs."],
];

export default function Home() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-16 px-4 pb-24 pt-16 sm:px-6 sm:pt-24 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-subtle">WhatsApp automation</p>
          <h1 className="mt-6 text-[clamp(3rem,7vw,5.5rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-fg">
            Put your WhatsApp on <span className="font-serif font-normal italic tracking-[-0.02em]">autopilot.</span>
          </h1>
          <p className="mt-8 max-w-md text-lg leading-relaxed text-muted">
            Asena moderates your groups, answers commands, turns photos into stickers, posts statuses and reminds
            people on time. One number, a hundred jobs.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/pair" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-fg px-6 font-medium text-black transition-opacity hover:opacity-90">
              Pair your number
              <ArrowRight size={17} />
            </Link>
            <a href="#use-cases" className="inline-flex h-12 items-center justify-center rounded-full border border-border px-6 font-medium text-fg transition-colors hover:border-border-strong">
              See what it does
            </a>
          </div>
          <p className="mt-6 text-sm text-subtle">Free and open source. Works with the WhatsApp account you already have.</p>
        </div>
        <ChatDemo />
      </section>

      <CommandTicker />

      <section id="use-cases" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-32 sm:px-6">
        <p className="font-mono text-xs uppercase tracking-[0.25em] text-subtle">Built for</p>
        <h2 className="mt-4 max-w-3xl text-5xl font-semibold leading-[1] tracking-[-0.05em] text-fg sm:text-6xl">
          One bot. <span className="font-serif font-normal italic">Every kind</span> of chat.
        </h2>
        <div className="mt-14">
          <UseCases />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-32 sm:px-6">
        <HomeStats />
      </section>

      <section className="border-t border-border">
        <div className="mx-auto grid max-w-6xl gap-16 px-4 py-32 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-subtle">Setup</p>
            <h2 className="mt-4 text-5xl font-semibold leading-[1] tracking-[-0.05em] text-fg">
              Live in <span className="font-serif font-normal italic">a minute.</span>
            </h2>
            <p className="mt-6 max-w-sm text-muted">
              Run it on your computer, your server, or free on Render. Your login is encrypted with a key only you hold.
            </p>
          </div>
          <ol className="divide-y divide-border border-y border-border">
            {steps.map(([title, text], index) => (
              <li key={title} className="grid grid-cols-[4rem_1fr] gap-6 py-8">
                <span className="font-serif text-5xl italic leading-none text-subtle">{index + 1}</span>
                <div>
                  <p className="text-xl font-medium text-fg">{title}</p>
                  <p className="mt-2 text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-32 text-center sm:px-6">
          <h2 className="mx-auto max-w-4xl text-[clamp(3rem,7vw,6rem)] font-semibold leading-[0.95] tracking-[-0.055em] text-fg">
            Let your WhatsApp <span className="font-serif font-normal italic">work for you.</span>
          </h2>
          <div className="mt-12 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/pair" className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-fg px-7 font-medium text-black hover:opacity-90">
              Pair your number
              <ArrowRight size={17} />
            </Link>
            <a href={site.github} className="inline-flex h-12 items-center justify-center rounded-full border border-border px-7 font-medium text-fg hover:border-border-strong">
              Source on GitHub
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
