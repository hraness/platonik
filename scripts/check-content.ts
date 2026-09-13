import { readFile, readdir } from "node:fs/promises";
import { documents, documentHref } from "../lib/docs";
import { site } from "../lib/site";

const known = new Set(documents.map(({ slug }) => slug));
const files = await readdir("docs");
for (const document of documents) {
  if (!files.includes(`${document.slug}.md`)) throw new Error(`Missing document: ${document.slug}`);
  const text = await readFile(`docs/${document.slug}.md`, "utf8");
  if (!text.startsWith("# ") || !/proposal/i.test(text.slice(0, 600))) throw new Error(`Missing title/proposal status: ${document.slug}`);
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const href = match[1];
    if (/^https:\/\//.test(href)) continue;
    const target = /^([a-z0-9-]+)\.md(?:#[\w-]+)?$/.exec(href);
    if (!target || !known.has(target[1] as typeof documents[number]["slug"])) throw new Error(`Unmapped document link: ${document.slug}: ${href}`);
    if (!documentHref(href).startsWith("/docs/")) throw new Error(`Link was not mapped: ${href}`);
  }
}
if (site.url !== "https://platonik.space" || site.repository !== "https://github.com/hraness/platonik") throw new Error("Unexpected public site identity");
console.log(`Checked ${documents.length} documents, relative document links, proposal status, and site identity.`);
