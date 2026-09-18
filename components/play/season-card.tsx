"use client";

import { useSeasonBoard } from "@/lib/play/season";

const number = (value: number) => value.toLocaleString("en-US");

function entrantName(raw: string): string {
  return raw.replace(/^github:/, "");
}

export function SeasonCard() {
  const { board, ready } = useSeasonBoard();

  if (!ready) return null;
  const rows = board?.global ?? [];
  if (rows.length === 0) return null;

  return (
    <div className="season-card">
      <div className="season-card-header">
        <strong>Season 0003 leaderboard</strong>
        <a className="lab-text-button" href="/lab/challenges">
          Full board <span aria-hidden="true">→</span>
        </a>
      </div>
      <div className="season-board">
        {rows.slice(0, 3).map((row, index) => (
          <div key={row.entrant} className="season-board-row">
            <span className="season-rank">#{row.rank}</span>
            <span className="season-entrant">{entrantName(row.entrant)}</span>
            <span className="season-score">
              {row.cleared}/{row.attempted} · {number(row.total_work)} work
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
