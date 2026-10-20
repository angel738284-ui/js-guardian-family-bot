import { readFile } from "node:fs/promises";
import path from "node:path";
import { marked } from "marked";
import { cacheLife } from "next/cache";
import { site } from "./site";

export async function getLegalPage(name: "privacy" | "terms"): Promise<string> {
  "use cache";
  cacheLife("max");
  const source = await readFile(path.join(process.cwd(), "content/legal", `${name}.md`), "utf8");
  const contact = site.contactEmail
    ? `[${site.contactEmail}](mailto:${site.contactEmail})`
    : `[a GitHub issue](${site.github}/issues)`;
  return marked.parse(source.replaceAll("{{github}}", site.github).replaceAll("{{contact}}", contact), { async: false });
}
