import type { Metadata } from "next";
import { getLegalPage } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What Asena collects, why, and how long it is kept.",
};

export default async function Page() {
  const html = await getLegalPage("privacy");
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
      <article className="prose-doc" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
