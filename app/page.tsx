import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const chapters = [
  ["The cell", "Give a small program a body. Watch what its local rules make possible."],
  ["The wound", "Mix lineages. Disable cells. Discover which colonies can recover."],
  ["The tissue", "Let a successful colony become a component of something larger."],
  ["The ecology", "Build partnerships between specialists. Meet environments that expose their weaknesses."],
  ["The frontier", "Evolve the processes that discover organisms, representations, and algorithms."],
];

export default function HomePage() {
  return (
    <main id="main" className="home">
      <section className="hero" aria-labelledby="hero-title">
        <h1 id="hero-title">Small rules.<br />Unfamiliar life.</h1>
        <p className="hero-description">A game about breeding algorithmic organisms—and discovering what they can do together.</p>
        <p className="hero-detail">You direct the research. Your agent runs the experiments. Tiny programs become cells, colonies, and eventually the building blocks of a larger world.</p>
        <div className="hero-links"><Link className="primary-link" href="/docs/game-design">Explore the game design <span aria-hidden="true">↗</span></Link><Link href="/docs">Read the documentation</Link></div>
        <p className="status-note">A game in design. This site is an invitation to explore the proposal.</p>
      </section>

      <section className="home-section first-world" aria-labelledby="first-world-title">
        <div className="section-intro"><h2 id="first-world-title">Begin with a wound.</h2><p>A line of cells is trying to sort itself. Each knows only its neighbors. Then some stop acting.</p></div>
        <figure className="cell-figure">
          <div className="cell-row" role="img" aria-label="Illustrative cells by value and policy: 3 B, 1 A, 6 A, 2 B, 8 A, 4 A, 7 B, 5 A. Cell 6 has a disabled controller. A and B are two local policies.">
            {[3, 1, 6, 2, 8, 4, 7, 5].map((value, index) => <div key={value} className={`cell ${index % 3 === 0 ? "cell-second" : ""} ${value === 6 ? "cell-wounded" : ""}`} aria-hidden="true"><span>{value}</span><span className="cell-policy">{index % 3 === 0 ? "B" : "A"}</span>{value === 6 && <span className="wound-mark">×</span>}</div>)}
          </div>
          <figcaption>A and B: two local policies. ×: a disabled controller.<br />Can the colony restore order?<br /><span>Concept illustration · not a simulation result</span></figcaption>
        </figure>
        <p>Breed a fast lineage with a resilient one. Inspect the offspring. Sometimes a useful move makes the world look less ordered before it gets better. The interesting part is finding out why—and whether it works somewhere new.</p>
        <Link className="text-link" href="/docs/game-design#the-first-fifteen-minutes-the-wound">Walk through the first fifteen minutes <span aria-hidden="true">↗</span></Link>
      </section>

      <section className="home-section conversation-section" aria-labelledby="conversation-title">
        <div className="section-intro"><h2 id="conversation-title">The conversation is the interface.</h2><p>Bring your own agent. Give it a question worth investigating.</p></div>
        <div className="conversation" aria-label="Illustrative player and agent conversation">
          <div className="message"><span className="speaker">You</span><p>Keep the quick one. Breed for recovery. I want to know what changes.</p></div>
          <div className="message"><span className="speaker">Agent</span><p>The offspring spends longer on healthy arrays, but gets around the stalled cell. I can disable its detour rule and compare both versions.</p></div>
          <div className="message"><span className="speaker">You</span><p>Do that. Then try a world it hasn’t seen.</p></div>
        </div>
        <p className="figure-note">An example of intended play. The Rust engine and agent skills are still to be built.</p>
        <p>The engine will own the state, rules, and evidence. Your agent will operate the laboratory and help you understand it. Every creature must work without the agent inside it.</p>
        <Link className="text-link" href="/docs/engine">How the agent and engine fit together <span aria-hidden="true">↗</span></Link>
      </section>

      <section className="home-section" aria-labelledby="scale-title">
        <div className="section-intro"><h2 id="scale-title">What you master becomes a beginning.</h2><p>The proposed world changes scale. A colony you once struggled to understand becomes one part of your next organism.</p></div>
        <ol className="chapter-list">{chapters.map(([title, description]) => <li key={title}><h3>{title}</h3><p>{description}</p></li>)}</ol>
        <p className="figure-note">The first prototype starts with cells and damage recovery. Later chapters are a direction to explore.</p>
      </section>

      <section className="home-section split-section" aria-labelledby="competition-title">
        <h2 id="competition-title">A frontier worth competing for.</h2>
        <div><p>Discover organisms that solve harder problems, survive unfamiliar conditions, and do more with the same resources.</p><p>Smarter agents and more search can help you find them. Ranked organisms will face equal execution limits and unseen challenges. Their results must be independently reproducible.</p><Link className="text-link" href="/docs/competition">Read the proposed competition rules <span aria-hidden="true">↗</span></Link></div>
      </section>

      <section className="home-section split-section" aria-labelledby="research-title">
        <h2 id="research-title">Play that leaves something useful behind.</h2>
        <div><p>Inspired by Michael Levin’s work on minimal collective systems, Platonik asks how much behavior a small set of rules can express.</p><p>A better algorithm. A surprising failure. A conjecture that survives a test. These can all be discoveries worth keeping. The long-term research ambition reaches toward computational complexity; a game score is evidence about its challenges, not a proof about P versus NP.</p><Link className="text-link" href="/docs/research">Explore the research foundations <span aria-hidden="true">↗</span></Link></div>
      </section>

      <section className="closing" aria-labelledby="closing-title"><h2 id="closing-title">The world starts with a few rules.</h2><p>The design is open. Start with the first creature, or go deeper into the experiments behind it.</p><Link className="primary-link" href="/docs">Read the Platonik field guide <span aria-hidden="true">↗</span></Link></section>
    </main>
  );
}
