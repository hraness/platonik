"use client";

import { useState } from "react";

export interface AgentPanelProps {
  /** Mission briefing text shown to the player and embedded in the prompt. */
  brief: string;
  /** Compact world description (layout, editable cells, goal). */
  worldSummary: string;
  /** The program schema reference for the agent. */
  schemaHelp: string;
  /** Current program JSON (so the agent sees what to improve). */
  currentProgram: string;
  /** Accept a pasted program back. Returns an error string or null. */
  onProgram: (json: string) => string | null;
}

/**
 * Bring-your-own-agent panel: copy a complete prompt for the player's own
 * agent, then paste the returned program. No account or model call needed —
 * the hosted /voice path can sit beside this later.
 */
export function AgentPanel({
  brief,
  worldSummary,
  schemaHelp,
  currentProgram,
  onProgram,
}: AgentPanelProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);

  const prompt = buildPrompt(brief, worldSummary, schemaHelp, currentProgram);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setFeedback("Clipboard is unavailable — select and copy the prompt text manually.");
    }
  }

  function acceptPaste() {
    const error = onProgram(pasted);
    if (error) {
      setFeedback(error);
    } else {
      setFeedback(null);
      setPasted("");
      setOpen(false);
    }
  }

  return (
    <div className="agent-panel">
      <button className="lab-text-button" type="button" onClick={() => setOpen((v) => !v)}>
        {open ? "Hide agent help" : "Ask your agent to write this program"}
      </button>
      {open && (
        <div className="agent-panel-body">
          <p className="lab-note">
            Paste this prompt into any coding agent. It contains the world, the goal, and the exact
            program format — no setup required on their side.
          </p>
          <pre className="agent-prompt" tabIndex={0} aria-label="Agent prompt">
            {prompt}
          </pre>
          <button className="lab-button secondary" type="button" onClick={copyPrompt}>
            {copied ? "Copied" : "Copy prompt"}
          </button>
          <label className="agent-paste-label" htmlFor="agent-paste">
            Paste the agent's program JSON
          </label>
          <textarea
            id="agent-paste"
            className="play-editor agent-paste"
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            rows={8}
            spellCheck={false}
            placeholder='{"rules": [...]}'
          />
          <button
            className="lab-button primary"
            type="button"
            disabled={!pasted.trim()}
            onClick={acceptPaste}
          >
            Use this program
          </button>
          {feedback && (
            <p className="play-error" role="alert">
              {feedback}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function buildPrompt(brief: string, world: string, schema: string, current: string): string {
  return `You are writing a program for Platonik, a deterministic habitat simulation.

MISSION
${brief}

WORLD
${world}

PROGRAM FORMAT
${schema}

Respond with ONLY the program as JSON — an object {"rules": [...]}. No prose, no code fences.

CURRENT PROGRAM (improve or replace it)
${current}`;
}
