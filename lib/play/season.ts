"use client";

import { useEffect, useState } from "react";

interface SeasonRow {
  rank: number;
  entrant: string;
  passed: boolean;
  cases_passed: number;
  cases_total: number;
  total_work: number;
  program_bytes: number;
  submission_hash: string;
}

interface SeasonChallenge {
  challenge: string;
  index: number;
  band: number;
  rows: SeasonRow[];
}

interface SeasonGlobal {
  rank: number;
  entrant: string;
  cleared: number;
  attempted: number;
  total_work: number;
}

interface SeasonBoard {
  schema: string;
  season: string;
  commitment: string;
  challenges: SeasonChallenge[];
  global: SeasonGlobal[];
}

let cache: Promise<SeasonBoard | null> | null = null;

async function loadBoard(): Promise<SeasonBoard | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch("/season/season-0003.json");
    if (!response.ok) return null;
    return (await response.json()) as SeasonBoard;
  } catch {
    return null;
  }
}

export function getSeasonBoard(): Promise<SeasonBoard | null> {
  if (!cache) cache = loadBoard();
  return cache;
}

export function useSeasonBoard() {
  const [board, setBoard] = useState<SeasonBoard | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getSeasonBoard().then((b) => {
      if (!cancelled) {
        setBoard(b);
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { board, ready };
}

export function seasonBestFor(
  board: SeasonBoard | null,
  challengeId: string,
): SeasonRow | null {
  if (!board) return null;
  const entry = board.challenges.find((c) => c.challenge === challengeId);
  if (!entry) return null;
  return entry.rows[0] ?? null;
}
