import type { Metadata } from "next";
import { getLegalPage } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The rules for using Asena's pairing server, dashboard and keep-alive jobs.",
};

export default async function Page() {
  const html = await getLegalPage("terms");
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
      <article className="prose-doc" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
