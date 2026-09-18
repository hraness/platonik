"use client";

import { useState } from "react";

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
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // The prompt text is right there to select manually.
    }
  }

  return (
    <details className="agent-setup">
      <summary>Tell your agent to set up Platonik</summary>
      <p className="lab-note">
        Paste this to your agent. It checks out the repo, writes a program for a case, and hands you
        back a verified link that opens the same case here — the URL is the save.
      </p>
      <pre tabIndex={0} aria-label="Agent setup prompt">
        {PROMPT}
      </pre>
      <button className="lab-button secondary" type="button" onClick={copy}>
        {copied ? "Copied" : "Copy the prompt"}
      </button>
    </details>
  );
}
