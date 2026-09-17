"use client";

import { useState } from "react";

export interface ProgramEditorProps {
  value: string;
  onChange: (value: string) => void;
  presets?: { name: string; label: string }[];
  onPreset?: (name: string) => void;
  label: string;
}

/**
 * Program editor: JSON textarea with structural validation hints and named
 * reference-program presets. Parse errors surface inline, before a run.
 */
export function ProgramEditor({ value, onChange, presets, onPreset, label }: ProgramEditorProps) {
  const [touched, setTouched] = useState(false);

  const diagnostic = diagnose(value);

  return (
    <div className="program-editor">
      <div className="program-editor-head">
        <h3>{label}</h3>
        {presets && presets.length > 0 && (
          <div className="play-loaders" role="group" aria-label="Load a reference program">
            {presets.map((preset) => (
              <button
                key={preset.name}
                className="lab-button secondary"
                type="button"
                onClick={() => onPreset?.(preset.name)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <textarea
        className="play-editor"
        value={value}
        onChange={(event) => {
          setTouched(true);
          onChange(event.target.value);
        }}
        rows={18}
        spellCheck={false}
        aria-label={label}
        aria-invalid={touched && !diagnostic.ok}
      />
      <p className={`program-diagnostic ${diagnostic.ok ? "ok" : "bad"}`} role="status">
        {diagnostic.message}
      </p>
    </div>
  );
}

function diagnose(value: string): { ok: boolean; message: string } {
  if (!value.trim()) return { ok: false, message: "The program is empty." };
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null || !Array.isArray(parsed.rules)) {
      return { ok: false, message: "A program is an object with a rules array." };
    }
    const rules = parsed.rules.length;
    return {
      ok: true,
      message: `${rules} rule${rules === 1 ? "" : "s"} — valid JSON. Run checks the rest.`,
    };
  } catch (cause) {
    return {
      ok: false,
      message: cause instanceof Error ? `JSON error: ${cause.message}` : "Invalid JSON.",
    };
  }
}
