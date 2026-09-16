import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import "../lab.css";

export const metadata: Metadata = {
  title: "Generated challenges",
  description: "A deterministic, growing set of worlds that score one submitted program on cases it never trained on. Reference baselines, replayed and ranked.",
  alternates: { canonical: "/lab/challenges" },
};

type BoardRow = {
  rank: number;
  entrant: string;
  passed: boolean;
  cases_passed: number;
  cases_total: number;
  total_work: number;
  program_bytes: number;
  submission_hash: string;
  tokens?: number;
};
type ChallengeBoard = { challenge: string; index: number; band: number; rows: BoardRow[] };
type GlobalRow = {
  rank: number;
  entrant: string;
  cleared: number;
  attempted: number;
  total_work: number;
  tokens?: number;
};
type ChallengesIndex = {
  schema: string;
  generator: number;
  policies: string[];
  challenges: ChallengeBoard[];
  global: GlobalRow[];
};

const work = (value: number) => value.toLocaleString("en-US");
const tokens = (value?: number) => (value === undefined ? "self-reported: none" : value.toLocaleString("en-US"));

export default async function ChallengesPage() {
  const index = JSON.parse(
    await readFile(path.join(process.cwd(), "public/challenges/index.json"), "utf8"),
  ) as ChallengesIndex;
  return <main id="main" className="lab">
    <header className="lab-header">
      <Link href="/lab">← Back to the observatory</Link>
      <h1>One program. Worlds it has never seen.</h1>
      <p>Every challenge derives from its number alone: four public training cases to iterate on, four reserved cases that score the submission. The artifact under test is the program your agent writes — the small language it invents for a world it could not memorize.</p>
      <p className="lab-note">Recorded reference baselines, replayed and ranked by the Rust CLI. This page displays checked results; it does not run a simulation or accept entries.</p>
    </header>
    <section aria-label="Global board">
      <h2>Global board</h2>
      <div className="lab-table-scroll" role="region" aria-label="Global board standings" tabIndex={0}>
        <table className="lab-table">
          <thead><tr><th scope="col">Rank</th><th scope="col">Entrant</th><th scope="col">Cleared</th><th scope="col">Attempted</th><th scope="col">Work</th><th scope="col">Tokens</th></tr></thead>
          <tbody>{index.global.map(row => <tr key={row.entrant}>
            <td>{row.rank}</td><th scope="row">{row.entrant}</th>
            <td>{row.cleared} of {index.challenges.length}</td><td>{row.attempted}</td>
            <td>{work(row.total_work)}</td><td>{tokens(row.tokens)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="lab-note">Cleared means every reserved case passed. Global work sums only cleared challenges. Token counts are self-reported; reference policies report none.</p>
    </section>
    <section aria-label="Challenge boards">
      <h2>Per-challenge boards</h2>
      <p className="lab-note">Rank order: reserved cases passed, then lower charged work, then fewer canonical program bytes. Every row was recomputed from the generator before recording.</p>
      <div className="lab-table-scroll" role="region" aria-label="Per-challenge standings" tabIndex={0}>
        <table className="lab-table">
          <thead><tr><th scope="col">Challenge</th><th scope="col">Band</th><th scope="col">Rank</th><th scope="col">Entrant</th><th scope="col">Cases</th><th scope="col">Work</th><th scope="col">Bytes</th></tr></thead>
          <tbody>{index.challenges.flatMap(board => board.rows.map(row => <tr key={`${board.challenge}-${row.entrant}`}>
            <td>{board.challenge}</td><td>{board.band}</td><td>{row.rank}</td>
            <th scope="row">{row.entrant}</th>
            <td>{row.cases_passed}/{row.cases_total}{row.passed ? " ✓" : ""}</td>
            <td>{work(row.total_work)}</td><td>{work(row.program_bytes)}</td>
          </tr>))}</tbody>
        </table>
      </div>
    </section>
    <section className="lab-reading">
      <h2>Enter from your own laboratory.</h2>
      <p>The window is thirty-two challenges today and grows by index. The resilient reference clears everything it was admitted to solve — the open contest is beating its charged work and its bytes, or clearing it with a stranger policy. The compact shuttle shows what an overfit route earns on unfamiliar ground.</p>
      <p><Link href="/docs/challenges">Read the eval design and run your agent →</Link></p>
      <p><Link href="/docs/competition">See the proposed ranked-season rules →</Link></p>
    </section>
  </main>;
}
