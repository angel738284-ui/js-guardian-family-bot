import type { Metadata } from "next";
import { DocPage } from "@/components/docs/doc-page";

export const metadata: Metadata = { title: "Documentation" };

export default function DocsIndex() {
  return <DocPage slug="introduction" />;
}
