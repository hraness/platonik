import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { videoGameJsonLd } from "@/lib/json-ld";
import { site } from "@/lib/site";
import atlas from "@/public/art/frontier/atlas.json";

export const metadata: Metadata = { alternates: { canonical: "/" }, openGraph: { url: "/", siteName: site.name } };

function TopicIcon({ slug }: Readonly<{ slug: string }>) {
  // Decorative local SVG; next/image cannot optimize vector sources.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="topic-icon" src={`/icons/${slug}.svg`} alt="" aria-hidden="true" width="88" height="88" loading="lazy" decoding="async" />
  );
}

function Machine({ kind, x, y, width, height }: Readonly<{ kind: keyof typeof atlas.sprites; x: number; y: number; width: number; height: number }>) {
  const sprite = atlas.sprites[kind];
  return (
    <svg x={x} y={y} width={width} height={height} viewBox={`${sprite.x} ${sprite.y} ${sprite.width} ${sprite.height}`} overflow="hidden" aria-hidden="true">
      <image href={atlas.image} width={atlas.width} height={atlas.height} style={{ imageRendering: "pixelated" }} />
    </svg>
  );
}

const progression = [
  ["Keep it supplied", "Watch rovers collect sparks and ore. A machine can only work when its next ingredients arrive."],
  ["Make it useful", "Turn ore into parts, parts into frames, and the first frame into a crane that connects two machines."],
  ["Reach farther", "Explore the ridge, place another machine, and draw a hauling loop that brings a distant deposit into your factory."],
];

export default function HomePage() {
  return (
    <main id="main" className="home" data-hraness-marketing-preset="editorial">
      <JsonLd data={videoGameJsonLd} />
      <div className="hraness-material-wall">
        <section className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title">Build a factory on a living frontier.</h1>
          <p className="hero-description">
            Put down a drill. Connect a hauling route. Turn ore and sparks into parts, frames, and the machines that carry them. Copperwake is a persistent world you can play in your browser and improve with your agent.
          </p>
          <p className="hero-detail">
            Follow a rover, find what is holding up the next machine, and make one useful change. Your factory keeps its supplies, its crew, and its history.
          </p>
          <div className="hero-links">
            <Link className="primary-link hraness-material-control" href="/play">Play Copperwake <span aria-hidden="true">↗</span></Link>
            <Link href="/play#world-agent-title">Bring your agent</Link>
          </div>
          <figure className="habitat-figure">
            <svg className="habitat-map" style={{ width: "100%", maxWidth: "840px" }} viewBox="0 0 840 310" role="img" aria-labelledby="factory-title factory-description">
              <title id="factory-title">Ore becomes parts, frames, and a working crane</title>
              <desc id="factory-description">Copper and teal machinery: a mining drill, glowing fabricator, twin-arm assembler, and cargo crane. A small wheeled courier carries supplies between them.</desc>
              <path d="M128 176 H718" fill="none" stroke="var(--line)" strokeWidth="2" strokeDasharray="5 8" />
              <Machine kind="drill" x={30} y={34} width={180} height={180} />
              <Machine kind="fabricator" x={224} y={12} width={178} height={202} />
              <Machine kind="assembler" x={428} y={47} width={196} height={168} />
              <Machine kind="crane" x={634} y={24} width={184} height={192} />
              <Machine kind="courier" x={377} y={216} width={72} height={72} />
              <g fill="var(--ink)" textAnchor="middle" fontSize="18">
                <text x="120" y="252">Extract</text>
                <text x="312" y="252">Smelt</text>
                <text x="526" y="252">Assemble</text>
                <text x="726" y="252">Transfer</text>
              </g>
            </svg>
            <figcaption>Start with a working supply loop. Build the crane that makes its next connection.</figcaption>
          </figure>
          <p className="status-note">
            Play locally in your browser. No account or model provider required. Export your world to keep it or continue with your own agent.
          </p>
        </section>
      </div>

      <section className="home-section first-world" aria-labelledby="world-title">
        <div className="section-intro">
          <TopicIcon slug="keep-light" />
          <h2 id="world-title">Every machine needs a way to work.</h2>
          <p>The drill has ore. The assembler needs a part. A rover is carrying the last ingredient for your crane. Follow the chain and decide what should change.</p>
        </div>
        <p>
          Run the factory, pause when something catches your eye, and select a machine to see its recipe, supplies, or unfinished construction bill. Place the next site and give a hauler a route through it. Couriers must bring every ingredient before it comes online.
        </p>
        <p>
          Copperwake has room beyond the starting circuit: a ridge with passes, more deposits, an eastern storehouse, and two beacons to keep supplied. The current region is finite. Where you build and how you connect it determine what its resources can do.
        </p>
        <Link className="text-link" href="/play">Explore the frontier <span aria-hidden="true">↗</span></Link>
      </section>

      <section className="home-section conversation-section" aria-labelledby="conversation-title">
        <div className="section-intro">
          <TopicIcon slug="conversation" />
          <h2 id="conversation-title">Give your agent a bigger ambition.</h2>
          <p>Build directly when you know the next step. Bring your agent the same saved world when you want help understanding or changing its behavior.</p>
        </div>
        <div className="conversation" aria-label="Illustrative player and agent conversation">
          <div className="message"><span className="speaker">You</span><p>The fabricator has parts waiting. Can we get them into the assembler without making every rover carry them?</p></div>
          <div className="message"><span className="speaker">Agent</span><p>A crane fits between those two machines. It needs one material, one part, and one frame. I’ll preserve this revision and check what changes once the couriers finish it.</p></div>
          <div className="message"><span className="speaker">You</span><p>Then help me bring the eastern deposit into the factory.</p></div>
        </div>
        <p className="figure-note">Illustrative dialogue. World state, costs, and completed transfers come from the engine.</p>
        <p>The browser and your agent use the same Rust rules. Export the latest save or copy its handoff, make a change, and bring the result back. Earlier revisions remain available for comparison.</p>
      </section>

      <section className="home-section" aria-labelledby="progression-title">
        <div className="section-intro">
          <TopicIcon slug="spark-route" />
          <h2 id="progression-title">One factory becomes a network.</h2>
          <p>Each useful connection gives the same world another capability.</p>
        </div>
        <ol className="chapter-list">
          {progression.map(([title, description]) => <li key={title}><h3>{title}</h3><p>{description}</p></li>)}
        </ol>
        <p>
          The current frontier supports mining, two production recipes, supplied construction, and automatic crane transfers. More uses for surplus production, reusable building plans, and larger regions are the next design work.
        </p>
        <Link className="text-link" href="/docs/living-world-plan">See what is playable and what comes next <span aria-hidden="true">↗</span></Link>
      </section>

      <section className="home-section split-section" aria-labelledby="evidence-title">
        <TopicIcon slug="research" />
        <h2 id="evidence-title">The story cannot fake the machinery.</h2>
        <div>
          <p>Programs, cargo, memory, construction, supplies, light, and work are authoritative Rust state. The game recomputes a saved world from its starting conditions and recorded interventions before displaying it.</p>
          <p>Your agent can explain a delivery or a bottleneck. It cannot award one, create a resource, erase a failure, or spend beyond an admitted command.</p>
          <Link className="text-link" href="/docs/engine">Read the engine rules <span aria-hidden="true">↗</span></Link>
        </div>
      </section>

      <section className="closing" aria-labelledby="closing-title">
        <h2 id="closing-title">What should Copperwake become?</h2>
        <p>Start the machines, follow a courier, and build the next useful connection.</p>
        <div className="hero-links">
          <Link className="primary-link" href="/play">Enter the world <span aria-hidden="true">↗</span></Link>
          <Link href="/play/lab">Archived puzzle laboratory</Link>
        </div>
      </section>
    </main>
  );
}
