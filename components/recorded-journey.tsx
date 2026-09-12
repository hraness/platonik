import { journeyAt, journeyKinds, type FirstAnswerJourney, type JourneyKind } from "@/lib/bridge/journey";

const labels: Record<JourneyKind, string> = {
  crew_supplied: "The crew has supplies",
  keeper_born: "Keeper joins the crew",
  reply_born: "The reply child joins",
  matching_reply: "A matching reply arrives",
};

export function RecordedJourney({ journey, tick }: { journey: FirstAnswerJourney; tick: number }) {
  const visible = journeyAt(journey, tick);
  return <section className="continuity-stops" aria-labelledby="answer-progress-title" data-testid="answer-progress">
    <h2 id="answer-progress-title">One crew. A first answer.</h2>
    <p>Four moments to earn in this recorded world. These are steps in a bounded journey; the six chapters of the Long Trail remain a larger design.</p>
    <ol aria-label="Journey milestones">{journeyKinds.map(kind => {
      const milestone = visible.milestones.find(item => item.kind === kind);
      return <li key={kind} data-milestone={kind} data-earned={Boolean(milestone)}>
        <strong>{labels[kind]}</strong>
        <p>{milestone ? `Reached at tick ${milestone.tick}.` : "Not reached at this tick."}{milestone?.cell !== null && milestone?.cell !== undefined && ` Cell ${milestone.cell}.`}{milestone?.spark !== null && milestone?.spark !== undefined && ` Spark ${milestone.spark}.`}{milestone?.signal !== null && milestone?.signal !== undefined && ` Report ${milestone.signal}.`}</p>
      </li>;
    })}</ol>
    {visible.answer ? <div data-testid="first-answer"><h3>The answer</h3><blockquote>{visible.answer}</blockquote><p>The checked exchange and completed service unlock this authored reply.</p></div>
      : <p data-testid="answer-pending">{tick < journey.horizon && tick < journey.tick
        ? "The journey must finish with its services intact before its answer is revealed."
        : "This recorded journey did not earn an answer. Its history remains available."}</p>}
  </section>;
}
