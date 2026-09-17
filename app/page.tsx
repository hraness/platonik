import type { Metadata } from "next";
import Link from "next/link";
import { videoGameJsonLd } from "@/lib/json-ld";
import { JsonLd } from "@/components/json-ld";
import { site } from "@/lib/site";

export const metadata: Metadata = { alternates: { canonical: "/" }, openGraph: { url: "/", siteName: site.name } };

function TopicIcon({ slug }: Readonly<{ slug: string }>) {
  // Decorative local SVG; next/image cannot optimize vector sources.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="topic-icon" src={`/icons/${slug}.svg`} alt="" aria-hidden="true" width="88" height="88" loading="lazy" decoding="async" />
  );
}

const chapters = [
  ["A spark in the dust", "Help your first companion carry light home. A distant beacon begins to answer."],
  ["The long trail", "Gather a herd of strange specialists. Find a way through worlds no creature can cross alone."],
  ["A living ark", "Build a habitat from their cooperating abilities. Watch your home leave the planet."],
  ["The free ports", "Connect independent settlements. Let a discovery you made help someone far from home."],
  ["The bloom", "Your creations begin creating. Guide the ambitions of a civilization learning to sustain itself."],
  ["Across the Quiet", "Lead living worlds beyond the last familiar route. Reach the Far Beacon—and answer it."],
];

const playableJourneys = [
  {
    title: "First camp",
    description: "Grow a descendant, survive a closing route, freeze a design, and face four confirmation crossings.",
    playHref: "/play?mode=expedition",
    docHref: "/docs/field-expedition",
  },
  {
    title: "The First Answer",
    description: "Build two crewmates, keep the lights supplied, and earn a local construction-to-contact ending.",
    playHref: "/play?mode=journeys&case=answer",
    docHref: "/docs/first-answer",
  },
  {
    title: "Ark control",
    description: "Carry a number, compute five result bits, and hold a service decision through a communications gap.",
    playHref: "/play?mode=journeys&case=ark",
    docHref: "/docs/ark-control",
  },
  {
    title: "Port commitments",
    description: "Make two physical handoffs, recover from lost replies, and preserve each finite spare.",
    playHref: "/play?mode=journeys&case=ports",
    docHref: "/docs/port-commitments",
  },
  {
    title: "Bloom exchange",
    description: "Grow two courier variants, choose from physical trials, and let the winner fulfill one request.",
    playHref: "/play?mode=journeys&case=exchange",
    docHref: "/docs/composition-v5-gate",
  },
];

export default function HomePage() {
  return (
    <main id="main" className="home" data-hraness-marketing-preset="editorial">
      <JsonLd data={videoGameJsonLd} />
      <div className="hraness-material-wall">
        <section className="hero" aria-labelledby="hero-title">
          <h1 id="hero-title">Play a creature in your browser.</h1>
          <p className="hero-description">An engineering game you play in chat with your AI. The engine runs in this tab, so every program, replay, and receipt stays right here.</p>
          <p className="hero-detail">Your agent can send you a link like <code className="hero-code">/play/p/&lt;hash&gt;?mode=challenges&amp;case=challenge-0001&amp;program=…</code>. Open it, and the deterministic Rust engine checks the program hash, loads the same case, and shows you what happens.</p>
          <div className="hero-links"><Link className="primary-link hraness-material-control" href="/play">Play now <span aria-hidden="true">↗</span></Link><Link href="/docs/campaign#the-playable-trailhead">Read the field guide</Link><Link href="/docs/engine">Build with the Rust CLI</Link></div>
          <p className="status-note">The browser game is the latest interaction: no install, no account, and a content-addressable URL for every program your agent writes. The complete campaign is still in design. <Link href="/docs/campaign#the-playable-trailhead">See what is integrated now.</Link></p>
        </section>
      </div>

        <section className="home-section first-world" aria-labelledby="first-world-title">
          <div className="section-intro"><TopicIcon slug="keep-light" />
<h2 id="first-world-title">Keep the little light alive.</h2><p>Your first creature carries sparks to a beacon. Then the short way closes. Can you help it find another?</p></div>
          <figure className="habitat-figure hraness-material-pane">
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
          <Link className="text-link" href="/play?mode=expedition">Play the first camp <span aria-hidden="true">↗</span></Link>
        </section>

      <section className="home-section conversation-section" aria-labelledby="conversation-title">
        <div className="section-intro"><TopicIcon slug="conversation" />
<h2 id="conversation-title">Start with “what if.”</h2><p>If you’ve ever asked an AI to build something and felt the thrill of seeing it work, you know where this begins.</p></div>
        <div className="conversation" aria-label="Illustrative player and agent conversation">
          <div className="message"><span className="speaker">You</span><p>I like Moth. Make it less helpless when the road disappears. Keep the original.</p></div>
          <div className="message"><span className="speaker">Agent</span><p>We could teach every cell to turn back, or mix in a few explorers. The explorers may find another route, but spend more of the journey wandering.</p></div>
          <div className="message"><span className="speaker">You</span><p>Try a few explorers. Show me what happens.</p></div>
        </div>
        <p className="figure-note">Illustrative dialogue. The shipped play skill can drive the first-camp commands through your own agent now.</p>
        <p>Chat is the interface. Your agent turns a wish into a small program; the engine runs it and returns snapshots of what happened. You choose what to keep, what to change, and how far to search.</p>
        <Link className="text-link" href="/docs/field-expedition#give-the-agent-a-persistent-ambition">Give your agent a persistent ambition <span aria-hidden="true">↗</span></Link>
      </section>

      <section className="home-section" aria-labelledby="playable-title">
        <div className="section-intro"><TopicIcon slug="spark-route" />
<h2 id="playable-title">Run a short trail today.</h2><p>Each link below opens the browser game on that track. Your agent can write a program there, copy a content-addressable link, and you can pick it up anywhere.</p></div>
        <div className="hero-links"><Link className="primary-link hraness-material-control" href="/play">Open /play <span aria-hidden="true">↗</span></Link><Link href="/docs/engine">Run the Rust CLI</Link></div>
        <ol className="chapter-list">{playableJourneys.map(({ title, description, playHref, docHref }) => <li key={title}><h3><Link href={playHref}>{title} <span aria-hidden="true">↗</span></Link></h3><p>{description}</p><Link className="text-link" href={docHref}>Read the guide <span aria-hidden="true">↗</span></Link></li>)}</ol>
        <p>These slices share one interpreter, checker, cost model, and evidence discipline. They are not yet one continuous campaign: finishing a journey does not unlock the next, and the moving ark and independent settlements remain proposals.</p>
        <Link className="text-link" href="/docs/campaign#the-playable-trailhead">See exactly what is integrated <span aria-hidden="true">↗</span></Link>
      </section>

      <section className="home-section" aria-labelledby="scale-title">
        <div className="section-intro"><TopicIcon slug="spark-route" />
<h2 id="scale-title">One companion. A civilization among the stars.</h2><p>Follow the Far Beacon. Each new journey asks more of your herd—and gives an old favorite another way to matter.</p></div>
        <ol className="chapter-list">{chapters.map(([title, description]) => <li key={title}><h3>{title}</h3><p>{description}</p></li>)}</ol>
        <p>Keep the original. Grow a descendant. Build a place where different habits flourish together. The herd you once led through the dust could become a fleet of living worlds.</p>
        <p className="figure-note">Proposed campaign arc. The runnable slices now reach construction, local contact, arithmetic control, finite promises, and one generated-courier exchange. They are not yet chained into the six chapters below.</p>
        <Link className="text-link" href="/docs/campaign">Follow the Long Trail <span aria-hidden="true">↗</span></Link>
        <p>Your couriers learn to carry signals. Signals become memory and control. Working habitats become places that can construct new ones. The Autoverse path gives each change of scale a capability to earn—and a reason to bring an earlier creation along.</p>
        <Link className="text-link" href="/docs/autoverse">Explore the Autoverse path <span aria-hidden="true">↗</span></Link>
        <p>Somewhere past the last port, something is already answering. The production voice endpoint renders labeled fiction from a checked wire digest, behind a Hraness account; it cannot alter the world or award an outcome.</p>
        <Link className="text-link" href="/docs/voices">Who answers at the Far Beacon? <span aria-hidden="true">↗</span></Link>
        <p className="figure-note">A complete design needs evidence from play. <Link href="/docs/design-validation">See what works today and the tests that come next.</Link></p>
      </section>

      <section className="home-section split-section" aria-labelledby="competition-title">
        <TopicIcon slug="creature" />
        <h2 id="competition-title">Bring your best strange little thing.</h2>
        <div><p>Race an archived rival through the same world. See where yours gets stuck. Build a response, and take another run at the frontier.</p><p>Hosted season 0003 is open across crossing, switchboard, and foundry challenges: your program faces withheld salt-derived cases, the evaluator replays every receipt, and the standings are public. The wider in-game competition remains a proposal.</p><Link className="text-link" href="/docs/seasons">Enter the open season <span aria-hidden="true">↗</span></Link> <Link className="text-link" href="/lab/challenges">See the standings <span aria-hidden="true">↗</span></Link></div>
      </section>

      <section className="home-section split-section" aria-labelledby="economy-title">
        <TopicIcon slug="economy" />
        <h2 id="economy-title">Someone needs what yours can do.</h2>
        <div><p>Your creature found a way around a broken road. Another player’s colony is still stuck. A proposed shared expedition board would let them commission help—and let your discovery find a life in someone else’s world.</p><p>Work in your own laboratory. Earn in-game credits for a checked result. Use them to ask another researcher for help. Published creatures would join a library everyone can reuse.</p><Link className="text-link" href="/docs/economy">Explore the proposed economy <span aria-hidden="true">↗</span></Link></div>
      </section>

      <section className="home-section split-section" aria-labelledby="research-title">
        <TopicIcon slug="research" />
        <h2 id="research-title">“Was that a fluke?” is a scientific question.</h2>
        <div><p>A surprising recovery. Two habits that work better together. An old creature finding its way through a new world. Ask your agent to investigate, and keep an experiment someone else can replay.</p><p>Inspired by Michael Levin’s questions about collective behavior, Platonik explores what simple rules can do when given different bodies and environments. Useful programs, repeatable effects, and revealing failures could contribute to research. Each claim has to earn its evidence.</p><Link className="text-link" href="/docs/research">Follow the questions into life, minds, and computation <span aria-hidden="true">↗</span></Link></div>
      </section>

      <section className="closing" aria-labelledby="closing-title"><h2 id="closing-title">What would you ask yours to become?</h2><p>Start with a local first rescue, keep every attempt, and decide which creation to take onward.</p><div className="hero-links"><Link className="primary-link" href="/play">Play now <span aria-hidden="true">↗</span></Link><Link href="/docs/game-design">Read the larger game design</Link></div></section>
    </main>
  );
}
