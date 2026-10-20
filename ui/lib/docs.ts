import { readFile } from "node:fs/promises";
import path from "node:path";
import { Marked, type Tokens } from "marked";
import { cacheLife } from "next/cache";
import { codeToHtml } from "shiki";

export interface DocLink {
  slug: string;
  title: string;
}

export const docSections: { title: string; docs: DocLink[] }[] = [
  {
    title: "Start",
    docs: [
      { slug: "introduction", title: "Introduction" },
      { slug: "getting-started", title: "Getting started" },
      { slug: "pairing", title: "Pairing and session IDs" },
      { slug: "dashboard", title: "Dashboard" },
      { slug: "configuration", title: "Configuration" },
    ],
  },
  {
    title: "Use",
    docs: [
      { slug: "commands", title: "Commands" },
      { slug: "writing-commands", title: "Writing commands" },
      { slug: "zapo-guide", title: "Using zapo" },
    ],
  },
  {
    title: "Run",
    docs: [
      { slug: "deploy-render", title: "Deploy on Render" },
      { slug: "troubleshooting", title: "Troubleshooting" },
    ],
  },
];

export const allDocs = docSections.flatMap((section) => section.docs);

export interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export async function getDoc(slug: string): Promise<{ title: string; html: string; headings: Heading[] } | null> {
  "use cache";
  cacheLife("max");

  const link = allDocs.find((doc) => doc.slug === slug);
  if (!link) return null;
  const source = await readFile(path.join(process.cwd(), "content/docs", `${slug}.md`), "utf8");

  const headings: Heading[] = [];
  const marked = new Marked({ async: true, gfm: true });
  marked.use({
    async walkTokens(token) {
      if (token.type === "code") {
        const code = token as Tokens.Code & { highlighted?: string };
        code.highlighted = await codeToHtml(code.text, {
          lang: code.lang && code.lang !== "env" ? code.lang : "text",
          themes: { light: "github-light", dark: "github-dark-default" },
          defaultColor: false,
        }).catch(() => undefined);
      }
    },
    renderer: {
      code(token) {
        const highlighted = (token as Tokens.Code & { highlighted?: string }).highlighted;
        return highlighted ?? false;
      },
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        const id = slugify(text);
        if (depth === 2 || depth === 3) headings.push({ id, text: text.replace(/<[^>]+>/g, ""), level: depth });
        return `<h${depth} id="${id}">${text}</h${depth}>\n`;
      },
    },
  });

  const html = await marked.parse(source);
  return { title: link.title, html, headings };
}
