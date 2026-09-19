"use client";

import { useState } from "react";

const ONE_LINER = `Set up a Platonik living world for us: clone https://github.com/hraness/platonik, read skills/platonik-play/SKILL.md, create and inspect a homestead with \`platonik world new\`, run one bounded improvement, and send me the verified URL from \`platonik world link\`. Keep the JSON save locally; the browser is our renderer.`;

const PROMPT = `Play Platonik with me as my world-building agent.

1. Clone https://github.com/hraness/platonik, build the CLI, and read skills/platonik-play/SKILL.md.
2. Run \`platonik world new Dustlight > dustlight-r0.world.json\`, then inspect it with \`platonik world report dustlight-r0.world.json\`.
3. Preserve that file. Apply one bounded command to a new file: advance 1–128 ticks, change one admitted creature program, place a fabricator or storehouse site on an open tile or a drill on a material deposit, or name a facility — then advance so I can watch the consequence. Explain what physically changed in plain language rather than leading with hashes or metrics.
4. Run \`platonik world link <new-world-file>\` and send me its URL. I will watch the exact recomputed world in the browser and tell you what we should build or improve next.

Never overwrite an earlier world file or hide a failed attempt. Keep external-agent effort separate from modeled world work. Ask me about consequential choices—resilient versus efficient, preserve a favorite versus replace its role, improve home versus explore farther—but handle routine CLI details yourself.`;

/**
 * A copyable "set me up" prompt: the player pastes it to their agent and gets
 * back a verified living-world link. One block is all the agent needs —
 * the repo path, the skill, and the bounded world command loop.
 */
export function AgentSetupCard() {
  const [copied, setCopied] = useState<"one" | "full" | false>(false);

  async function copyOne() {
    try {
      await navigator.clipboard.writeText(ONE_LINER);
      setCopied("one");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // The prompt text is right there to select manually.
    }
  }

  async function copyFull() {
    try {
      await navigator.clipboard.writeText(PROMPT);
      setCopied("full");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // The prompt text is right there to select manually.
    }
  }

  return (
    <details className="agent-setup">
      <summary>Tell your agent to set up Platonik</summary>
      <p className="lab-note">Paste the one-liner to your agent, or expand for the full setup prompt.</p>
      <pre tabIndex={0} aria-label="One-line agent ask">
        {ONE_LINER}
      </pre>
      <div className="play-loaders">
        <button className="lab-button secondary" type="button" onClick={copyOne}>
          {copied === "one" ? "Copied" : "Copy one-line ask"}
        </button>
        <button className="lab-button secondary" type="button" onClick={copyFull}>
          {copied === "full" ? "Copied" : "Copy the full prompt"}
        </button>
      </div>
      <details>
        <summary style={{ fontSize: 13, color: "var(--muted)", marginTop: 10, cursor: "pointer" }}>
          Full prompt
        </summary>
        <pre tabIndex={0} aria-label="Agent setup prompt" style={{ marginTop: 10 }}>
          {PROMPT}
        </pre>
      </details>
    </details>
  );
}
