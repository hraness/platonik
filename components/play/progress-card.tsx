"use client";

import { useEffect, useState } from "react";
import { OPENING_MISSIONS } from "@/lib/play/missions";
import { allMarks, allScores } from "@/lib/play/saves";

interface Progress {
  opening: number;
  challenges: number;
  journeys: number;
}

/**
 * A small persistent-progress readout: how many opening missions, generated
 * challenges, and journey cases the player has passed in this browser.
 */
export function ProgressCard() {
  const [progress, setProgress] = useState<Progress | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([allMarks(), allScores()]).then(([marks, scores]) => {
      if (cancelled) return;
      const opening = marks.filter((m) => m.passed && m.key.startsWith("opening:")).length;
      const journeys = marks.filter((m) => m.passed && m.key.startsWith("journey:")).length;
      const challenges = scores.filter((s) => s.passed).length;
      setProgress({ opening, challenges, journeys });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!progress) return null;

  const openingMax = OPENING_MISSIONS.length;
  const challengeMax = 96;

  return (
    <div className="progress-card">
      <span className="progress-item">
        First run <strong>{progress.opening}/{openingMax}</strong>
      </span>
      <span className="progress-item">
        Journeys <strong>{progress.journeys}</strong> cases
      </span>
      <span className="progress-item">
        Challenges <strong>{progress.challenges}/{challengeMax}</strong>
      </span>
      <a className="progress-item" href="/lab/challenges">
        Season board <span aria-hidden="true">→</span>
      </a>
    </div>
  );
}
