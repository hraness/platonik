import { documents } from "@/lib/docs";
import { labPages } from "@/lib/lab-pages";
import { site } from "@/lib/site";

/**
 * A curated map of the genuinely public pages, in the style of
 * hraness.com/llms.txt. It lists real destinations only; every lab and
 * document entry comes from the same registries that drive the sitemap.
 */
export const dynamic = "force-static";

export function GET() {
  const lines = [
    `# ${site.name}`,
    "",
    `> ${site.description}`,
    "",
    "Platonik is a persistent automation world built through an external AI agent and inspected in a read-only browser renderer. The initial Dustlight protocol is implemented; the field guide distinguishes it from later production and campaign plans.",
    "",
    "When to use this site:",
    `- Use ${site.url}/play to inspect the current Dustlight world and copy the own-agent setup ask.`,
    `- Use ${site.repository} for the authoritative Rust CLI, world JSON, and play skill.`,
    `- Use ${site.url}/docs for the living-world commands, exact boundaries, design, and evidence.`,
    `- Use ${site.url}/play/lab or ${site.url}/lab for the archived puzzle tracks and recorded Rust studies.`,
    `- Use ${site.url}/lab/challenges for the separate hosted generated-challenge season.`,
    `- Use ${site.url} for the concise product direction and current status.`,
    "",
    "## Pages",
    `- [${site.name}](${site.url}/): ${site.description}`,
    `- [Living world](${site.url}/play): Read-only Rust recomputation, visual replay, entity inspection, world import/export, and own-agent handoff.`,
    `- [The observatory](${site.url}/lab): Executable organisms, fuzzy truth landscapes, world budgets, and an Autoverse signal workbench.`,
    ...labPages.map(({ path, name, description }) => `- [${name}](${site.url}${path}): ${description}`),
    `- [Documentation](${site.url}/docs): The living-world command guide, exact engine boundary, earlier evidence, and larger design.`,
    ...documents.map(({ slug, title, description }) => `- [${title}](${site.url}/docs/${slug}): ${description}`),
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
