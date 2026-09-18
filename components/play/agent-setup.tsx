"use client";

import { useState } from "react";

const ONE_LINER = `Set up Platonik for me: clone https://github.com/hraness/platonik, read skills/platonik-play/SKILL.md, pick one target (challenge-0001 is fine), and send back a verified https://platonik.space/play/p/<sha256>?mode=challenges&case=challenge-0001&program=<base64url> link. The URL is the save — the browser checks the hash.`;

const PROMPT = `Play Platonik with me — a browser game where you program small creatures that carry sparks through a habitat.

1. Clone https://github.com/hraness/platonik and read skills/platonik-play/SKILL.md — it documents the Rust CLI and the program schema. (Or just work from the repo's docs/challenges.md + docs/seasons.md if you prefer.)
2. Pick a target and write a program that passes it:
   - challenges: 96 generated worlds, ids challenge-0001..challenge-0096 — verify locally with the CLI's eval.
   - journeys: continuous-habitat cases (continuity, construction, answer, ark, ports, bloom, exchange).
   - opening: the three tutorial missions (opening-normal, opening-wounded, ark-plan-a).
3. Send me a link in exactly this form:
   https://platonik.space/play/p/<sha256>?mode=<track>&case=<id>&program=<base64url>
   - <track>: opening | challenges | expedition | journeys
   - <base64url>: the canonical JSON program — object keys sorted recursively, compact separators, UTF-8, base64url without padding
   - <sha256>: hex SHA-256 of that same canonical string
   The page verifies the hash, loads the same case, and runs your program in my browser — no server round trip, no account.`;

/**
 * A copyable "set me up" prompt: the player pastes it to their agent and gets
 * back a verified /play/p/<hash> link. One block is all the agent needs —
 * the repo path, the skill, the URL format, and the canonicalization rules.
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
