import type { Metadata } from "next";
import { site } from "@/lib/site";
import { PairFlow } from "@/components/pair/pair-flow";

export const metadata: Metadata = {
  title: "Pair a device",
  description: "Link WhatsApp to Asena with a QR code or pairing code and get a session ID for your bot.",
};

export default function PairPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-subtle">Pair</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.035em] text-fg sm:text-5xl">Link WhatsApp to Asena</h1>
        <p className="mt-4 text-lg text-muted">
          Link the bot’s WhatsApp account here and get a session ID. Your bot loads its login with it, wherever
          you run it, and keeps it backed up here, encrypted with that ID. Want to manage it later? Use the{" "}
          <a href={`${site.appUrl}`} className="text-fg underline underline-offset-4">dashboard</a>.
        </p>
      </div>
      <div className="mt-12">
        <PairFlow />
      </div>
    </div>
  );
}
