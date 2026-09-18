import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { videoGameJsonLd } from "@/lib/json-ld";
import { site } from "@/lib/site";

export const metadata: Metadata = { alternates: { canonical: "/" }, openGraph: { url: "/", siteName: site.name } };

function TopicIcon({ slug }: Readonly<{ slug: string }>) {
  // Decorative local SVG; next/image cannot optimize vector sources.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="topic-icon" src={`/icons/${slug}.svg`} alt="" aria-hidden="true" width="88" height="88" loading="lazy" decoding="async" />
  );
}

const progression = [
  ["Running now", "A homestead, two light routes, persistent supplies, and a foundry that builds a second courier."],
  ["Build next", "Repeatable production, reusable blueprints, visible queues, and new outposts in the same saved world."],
  ["Grow outward", "Specialized settlements and larger networks whose old creatures and infrastructure still matter."],
];

export default function HomePage() {
  return (
    <main id="main" className="home" data-hraness-marketing-preset="editorial">
      <JsonLd data={videoGameJsonLd} />
      <div className="hraness-material-wall">
        <section className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title">Build a living world with your agent.</h1>
          <p className="hero-description">
            Ask for another courier, a steadier route, or more carrying capacity. Your agent builds it in a deterministic local world. The browser lets you watch every creature and resource move.
          </p>
          <p className="hero-detail">
            No puzzle menu and no JSON editor. Your agent is the workbench; this is the window into what you made together.
          </p>
          <div className="hero-links">
            <Link className="primary-link hraness-material-control" href="/play">Open Dustlight <span aria-hidden="true">↗</span></Link>
            <Link href="/play#world-agent-title">Set it up with your agent</Link>
          </div>
          <p className="status-note">
            The first living-world protocol is available now: one persistent homestead, bounded advances, recorded policy changes, material-dependent construction, and content-addressed browser views.
          </p>
        </section>
      </div>

      <section className="home-section first-world" aria-labelledby="world-title">
        <div className="section-intro">
          <TopicIcon slug="keep-light" />
          <h2 id="world-title">Watch the system become capable.</h2>
          <p>Light has to travel. Construction needs material. Every new creature occupies the same physical world as the ones already working.</p>
        </div>
        <figure className="habitat-figure hraness-material-pane">
          <svg className="habitat-map" viewBox="0 0 420 230" role="img" aria-labelledby="habitat-title habitat-description">
            <title id="habitat-title">Two working supply routes around a foundry</title>
            <desc id="habitat-description">A source feeds a courier route toward a beacon. A foundry between two lanes builds another courier, allowing a second source to supply another home.</desc>
            <g fill="none" stroke="currentColor" strokeWidth="2">
              <path className="habitat-path" d="M45 70 H375 M45 165 H375" />
              <rect x="190" y="98" width="40" height="40" rx="4" fill="var(--wash)" />
              <circle cx="115" cy="70" r="10" fill="var(--wash)" />
              <circle cx="270" cy="165" r="10" fill="var(--wash)" />
              <path d="M361 84 V57 L375 42 389 57 V84Z M361 179 V152 L375 137 389 152 V179Z" fill="var(--wash)" />
            </g>
            <g fill="currentColor" textAnchor="middle">
              <text x="45" y="38">Light</text><text x="375" y="24">Homes</text>
              <text x="210" y="122">Build</text>
              <text x="210" y="210" className="habitat-label">The second route exists because the first world built it</text>
            </g>
          </svg>
          <figcaption>The current Dustlight homestead has two finite supply lanes and one checked construction. Open it to watch the exact Rust-engine replay.</figcaption>
        </figure>
        <p>
          A creature can carry light, remember a signal, or assemble a declared body. A useful change stays in the world, along with its costs and history. When something stalls, you can inspect the moment and ask your agent for one understandable improvement.
        </p>
        <Link className="text-link" href="/play">Watch the homestead <span aria-hidden="true">↗</span></Link>
      </section>

      <section className="home-section conversation-section" aria-labelledby="conversation-title">
        <div className="section-intro">
          <TopicIcon slug="conversation" />
          <h2 id="conversation-title">Describe an ambition, not a command.</h2>
          <p>Your agent handles the program and the checked local save. You decide what kind of world is worth making.</p>
        </div>
        <div className="conversation" aria-label="Illustrative player and agent conversation">
          <div className="message"><span className="speaker">You</span><p>The lower route is doing all the work. Can we bring the second home online without replacing Moth?</p></div>
          <div className="message"><span className="speaker">Agent</span><p>The foundry can build Moss beside the unused source. It costs one of our two construction units. I’ll preserve this world, run the build, and show you the result.</p></div>
          <div className="message"><span className="speaker">You</span><p>Do it. Then show me where the next bottleneck is.</p></div>
        </div>
        <p className="figure-note">Illustrative dialogue; the resulting world state and replay must come from the engine.</p>
        <p>The browser never edits or advances the save. Each agent action produces a new, verified view, so you can compare what changed and keep every earlier version.</p>
      </section>

      <section className="home-section" aria-labelledby="progression-title">
        <div className="section-intro">
          <TopicIcon slug="spark-route" />
          <h2 id="progression-title">One world, growing in depth.</h2>
          <p>The game expands through capabilities in the same system—not through a collection of disconnected challenge screens.</p>
        </div>
        <ol className="chapter-list">
          {progression.map(([title, description]) => <li key={title}><h3>{title}</h3><p>{description}</p></li>)}
        </ol>
        <p>
          The current world carries physical state and cumulative work across bounded runs. Repeatable factories, free-form placement, larger maps, and autonomous discovery still require engine work; they are the next direction, not claims hidden behind the renderer.
        </p>
        <Link className="text-link" href="/docs/engine">Read the exact engine boundary <span aria-hidden="true">↗</span></Link>
      </section>

      <section className="home-section split-section" aria-labelledby="evidence-title">
        <TopicIcon slug="research" />
        <h2 id="evidence-title">The story cannot fake the machinery.</h2>
        <div>
          <p>Programs, cargo, memory, construction, supplies, light, and work are authoritative Rust state. The viewer recomputes the world from its genesis and recorded interventions before displaying it.</p>
          <p>Agent prose can explain a delivery or a bottleneck. It cannot award one, create a resource, erase a failure, or spend beyond the engine’s bounded command.</p>
          <Link className="text-link" href="/docs/game-design">Explore the larger direction <span aria-hidden="true">↗</span></Link>
        </div>
      </section>

      <section className="closing" aria-labelledby="closing-title">
        <h2 id="closing-title">What should Dustlight become?</h2>
        <p>Open the world, follow a creature, and tell your agent what you want to make possible next.</p>
        <div className="hero-links">
          <Link className="primary-link" href="/play">Enter the world <span aria-hidden="true">↗</span></Link>
          <Link href="/play/lab">Archived puzzle laboratory</Link>
        </div>
      </section>
    </main>
  );
}
