import { Suspense } from "react";
import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { docSections } from "@/lib/docs";

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <div className="mx-auto flex max-w-6xl gap-8 px-4 sm:px-6">
      <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-52 shrink-0 overflow-y-auto py-10 lg:block">
        <Suspense fallback={null}>
          <DocsSidebar sections={docSections} />
        </Suspense>
      </aside>
      <div className="min-w-0 flex-1">
        <details className="mt-6 rounded-2xl border border-border lg:hidden">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-fg">Documentation menu</summary>
          <div className="border-t border-border p-3">
            <Suspense fallback={null}>
          <DocsSidebar sections={docSections} />
            </Suspense>
          </div>
        </details>
        {children}
      </div>
    </div>
  );
}
