"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadLastPlay, type LastPlay } from "@/lib/play/saves";

const TRACK_TITLES: Record<string, string> = {
  opening: "First run",
  challenges: "Challenges",
  expedition: "Expedition",
  journeys: "Journeys",
};

/**
 * A small landing card that either invites a new player to start the opening
 * or offers a returning player a one-click path back to their last track/case.
 */
export function ResumeCard() {
  const [last, setLast] = useState<LastPlay | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadLastPlay().then((value) => {
      if (!cancelled) setLast(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!last) {
    return (
      <div className="resume-card">
        <Link className="lab-button" href="/play?mode=opening&case=opening-normal">
          Start the opening
        </Link>
        <span className="resume-note">Three missions that teach the loop.</span>
      </div>
    );
  }

  const query = last.case ? `?mode=${last.track}&case=${last.case}` : `?mode=${last.track}`;
  const label = last.case ? `${TRACK_TITLES[last.track] ?? last.track} · ${last.case}` : (TRACK_TITLES[last.track] ?? last.track);

  return (
    <div className="resume-card">
      <Link className="lab-button" href={`/play${query}`}>
        Continue: {label}
      </Link>
      <span className="resume-note">Picks up where you left off in this browser.</span>
    </div>
  );
}
