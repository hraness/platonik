import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const chapters = [
  ["Make it", "Give a little creature a name and a job. Watch your idea take its first steps."],
  ["Help it recover", "Its usual route has failed. Keep the habit you love; change the one that gets it stuck."],
  ["Bring it company", "Try a mixed colony. Discover whether different habits help each other."],
  ["Change its world", "Take a favorite somewhere unfamiliar. Find out what it learned to do—and where it still fails."],
  ["Build something larger", "Let your colony become part of another organism. Meet a whole new scale of problems."],
];

export default function HomePage() {
  return (
    <main id="main" className="home">
      <section className="hero" aria-labelledby="hero-title">
        <h1 id="hero-title">Make a creature.<br />See what it becomes.</h1>
        <p className="hero-description">A game about building little creatures with your AI—and discovering what they can do.</p>
        <p className="hero-detail">Give yours a name. Ask it to do something. Help it survive when the world changes. Follow small surprises into bigger questions about life and minds.</p>
        <div className="hero-links"><Link className="primary-link" href="/docs/game-design">Explore the game design <span aria-hidden="true">↗</span></Link><Link href="/docs">Read the field guide</Link></div>
        <p className="status-note">A game in design. This site explores the proposal; there is no playable release yet.</p>
      </section>

      <section className="home-section first-world" aria-labelledby="first-world-title">
        <div className="section-intro"><h2 id="first-world-title">Keep the little light alive.</h2><p>Your first creature carries sparks to a beacon. Then the short way closes. Can you help it find another?</p></div>
        <figure className="habitat-figure">
          <svg className="habitat-map" viewBox="0 0 420 230" role="img" aria-labelledby="habitat-title habitat-description">
            <title id="habitat-title">A spark route with a way around</title>
            <desc id="habitat-description">Concept map: the spring is on the left and the beacon on the right. A cross blocks the short upper path. Three courier cells approach it. One courier is on the longer lower path, which remains open. This is an illustration, not a simulation result.</desc>
            <g fill="none" stroke="currentColor" strokeWidth="2">
              <path className="habitat-path" d="M45 90 H180 M226 90 H375 M45 90 V180 H375 V90" />
              <path className="habitat-block" d="m195 79 22 22 m0-22-22 22" />
              <rect x="31" y="76" width="28" height="28" rx="3" fill="var(--paper)" />
              <path d="m45 82 7 8-7 8-7-8Z" fill="var(--accent)" />
              <path d="M361 104 V77 L375 62 389 77 V104Z" fill="var(--wash)" />
              <path d="M368 88 H382" />
              <circle cx="110" cy="90" r="10" fill="var(--wash)" />
              <circle cx="143" cy="90" r="10" fill="var(--wash)" />
              <circle cx="174" cy="90" r="10" fill="var(--wash)" />
              <circle cx="139" cy="180" r="10" fill="var(--wash)" />
            </g>
            <g fill="currentColor" textAnchor="middle">
              <text x="45" y="46">Spring</text><text x="375" y="46">Beacon</text>
              <text x="207" y="132" className="habitat-label">Route closed</text>
              <text x="245" y="215" className="habitat-label">A longer way home</text>
            </g>
          </svg>
          <figcaption>One cell turns back. Another keeps trying the closed passage.<br />Which habit would you pass on?<br /><span>Concept illustration · circles represent courier cells · not a simulation result</span></figcaption>
        </figure>
        <p>Meet Moth, who favors the direct route, and Moss, who explores. Mix their cells. Name a child. A useful change might keep the beacon lit after a collapse, while delivering less light on an easy journey.</p>
        <p>The light waits while you think. A failed expedition leaves your creature’s lineage intact. There is always another idea to try.</p>
        <Link className="text-link" href="/docs/game-design#the-first-fifteen-minutes-the-wound">Imagine your first expedition <span aria-hidden="true">↗</span></Link>
      </section>

      <section className="home-section conversation-section" aria-labelledby="conversation-title">
        <div className="section-intro"><h2 id="conversation-title">Start with “what if.”</h2><p>If you’ve ever asked an AI to build something and felt the thrill of seeing it work, you know where this begins.</p></div>
        <div className="conversation" aria-label="Illustrative player and agent conversation">
          <div className="message"><span className="speaker">You</span><p>I like Moth. Make it less helpless when the road disappears. Keep the original.</p></div>
          <div className="message"><span className="speaker">Agent</span><p>We could teach every cell to turn back, or mix in a few explorers. The explorers may find another route, but spend more of the journey wandering.</p></div>
          <div className="message"><span className="speaker">You</span><p>Try a few explorers. Show me what happens.</p></div>
        </div>
        <p className="figure-note">Illustrative dialogue. The Rust engine and agent skills are still to be built.</p>
        <p>Chat is the interface. Your agent turns a wish into a small program; the engine runs it and returns snapshots of what happened. You choose what to keep, what to change, and how far to search.</p>
        <Link className="text-link" href="/docs/game-design#chat-with-something-to-watch">How play would feel in chat <span aria-hidden="true">↗</span></Link>
      </section>

      <section className="home-section" aria-labelledby="scale-title">
        <div className="section-intro"><h2 id="scale-title">Your favorite has a future.</h2><p>A creature becomes a colony. A colony becomes part of a larger body. The little thing you made keeps finding new roles.</p></div>
        <ol className="chapter-list">{chapters.map(([title, description]) => <li key={title}><h3>{title}</h3><p>{description}</p></li>)}</ol>
        <p className="figure-note">The first prototype is proposed around one beacon expedition. Larger bodies and later worlds remain future directions.</p>
      </section>

      <section className="home-section split-section" aria-labelledby="competition-title">
        <h2 id="competition-title">Bring your best strange little thing.</h2>
        <div><p>Race an archived rival through the same world. See where yours gets stuck. Build a response, and take another run at the frontier.</p><p>Smarter agents and more search can help you discover better creatures. Ranked entries will face equal execution limits and unfamiliar challenges, with independently checked results. The leaderboard rewards what your creation can actually do.</p><Link className="text-link" href="/docs/competition">Read the proposed competition rules <span aria-hidden="true">↗</span></Link></div>
      </section>

      <section className="home-section split-section" aria-labelledby="research-title">
        <h2 id="research-title">“Was that a fluke?” is a scientific question.</h2>
        <div><p>A surprising recovery. Two habits that work better together. An old creature finding its way through a new world. Ask your agent to investigate, and keep an experiment someone else can replay.</p><p>Inspired by Michael Levin’s questions about collective behavior, Platonik explores what simple rules can do when given different bodies and environments. Useful programs, repeatable effects, and revealing failures could contribute to research. Each claim has to earn its evidence.</p><Link className="text-link" href="/docs/research">Follow the questions into life, minds, and computation <span aria-hidden="true">↗</span></Link></div>
      </section>

      <section className="closing" aria-labelledby="closing-title"><h2 id="closing-title">What would you ask yours to become?</h2><p>Start with a first rescue. Go deeper into breeding, competition, or the ideas behind this possible world.</p><Link className="primary-link" href="/docs/game-design">Read the Platonik game design <span aria-hidden="true">↗</span></Link></section>
    </main>
  );
}
