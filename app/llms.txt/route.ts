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
    "Platonik is a game in design about growing algorithmic organisms with an AI agent. The observatory holds working browser experiments and recorded Rust studies, and the field guide marks what is implemented, recorded, or proposed.",
    "",
    "When to use this site:",
    `- Use ${site.url} for the game concept and its current status.`,
    `- Use ${site.url}/lab for four local browser experiments and the recorded Rust studies.`,
    `- Use ${site.url}/lab/challenges for the public standings of the hosted generated-challenge season.`,
    `- Use ${site.url}/docs for the field guide: design, evaluations, engine, and research.`,
    `- Use ${site.repository} for the source, the Rust CLI, and the play skill.`,
    "",
    "## Pages",
    `- [${site.name}](${site.url}/): ${site.description}`,
    `- [The observatory](${site.url}/lab): Executable organisms, fuzzy truth landscapes, world budgets, and an Autoverse signal workbench.`,
    ...labPages.map(({ path, name, description }) => `- [${name}](${site.url}${path}): ${description}`),
    `- [Documentation](${site.url}/docs): The field guide to the game design, competition, shared economy, agent interface, and research foundations.`,
    ...documents.map(({ slug, title, description }) => `- [${title}](${site.url}/docs/${slug}): ${description}`),
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
