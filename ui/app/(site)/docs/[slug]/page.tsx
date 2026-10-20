import type { Metadata } from "next";
import { DocPage } from "@/components/docs/doc-page";
import { allDocs } from "@/lib/docs";

export function generateStaticParams() {
  return allDocs.map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: PageProps<"/docs/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: allDocs.find((doc) => doc.slug === slug)?.title ?? "Documentation" };
}

export default async function DocSlugPage({ params }: PageProps<"/docs/[slug]">) {
  const { slug } = await params;
  return <DocPage slug={slug} />;
}
