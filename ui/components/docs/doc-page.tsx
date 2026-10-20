import Link from "next/link";
import { notFound } from "next/navigation";
import { allDocs, getDoc } from "@/lib/docs";
import { site } from "@/lib/site";
import { ArrowRight, ArrowUpRight } from "../icons";

export async function DocPage({ slug }: { slug: string }) {
  const doc = await getDoc(slug);
  if (!doc) notFound();

  const index = allDocs.findIndex((item) => item.slug === slug);
  const previous = allDocs[index - 1];
  const next = allDocs[index + 1];

  return (
    <div className="flex gap-8 py-10 lg:py-14">
      <article className="min-w-0 max-w-3xl flex-1">
        <div className="prose-doc" dangerouslySetInnerHTML={{ __html: doc.html }} />

        <div className="mt-16 grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
          {previous ? (
            <Link href={`/docs/${previous.slug}`} className="rounded-2xl border border-border p-4 transition-colors hover:border-border-strong">
              <p className="text-xs text-subtle">Previous</p>
              <p className="mt-1 font-medium text-fg">{previous.title}</p>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/docs/${next.slug}`} className="rounded-2xl border border-border p-4 text-right transition-colors hover:border-border-strong">
              <p className="text-xs text-subtle">Next</p>
              <p className="mt-1 inline-flex items-center gap-1.5 font-medium text-fg">
                {next.title}
                <ArrowRight size={15} />
              </p>
            </Link>
          )}
        </div>
        <a
          href={`${site.github}/edit/main/ui/content/docs/${slug}.md`}
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg"
        >
          Edit this page on GitHub
          <ArrowUpRight size={14} />
        </a>
      </article>

      {doc.headings.length > 0 && (
        <aside className="sticky top-24 hidden h-fit w-44 shrink-0 xl:block">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">On this page</p>
          <ul className="mt-3 space-y-2 text-sm">
            {doc.headings.map((heading) => (
              <li key={heading.id} className={heading.level === 3 ? "pl-3" : ""}>
                <a href={`#${heading.id}`} className="text-muted transition-colors hover:text-fg">
                  {heading.text}
                </a>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
