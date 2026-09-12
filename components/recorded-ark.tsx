import { arkAt, type ArkGrade } from "@/lib/bridge/ark";

export function RecordedArk({ grade, tick }: { grade: ArkGrade; tick: number }) {
  const visible = arkAt(grade, tick);
  return <section className="continuity-stops" aria-labelledby="ark-progress-title" data-testid="ark-progress">
    <h2 id="ark-progress-title">Calculate. Remember. Keep the service running.</h2>
    <p>The courier transports one operand. Local cells combine it with a stored operand, one bit at a time. Keeper must remember the selected result when the connection goes quiet.</p>
    <p data-testid="ark-inputs">Declared inputs: {grade.declared_a} + {grade.declared_b}. Plan: {grade.plan === "carry" ? "Reserve — overflow carry (bit 4)" : "Staggered — odd or even sum (bit 0)"}.</p>
    <h3>Bits emitted so far</h3>
    {visible.outputs.length ? <ol aria-label="Arithmetic output bits">{visible.outputs.map(output => <li key={output.index} data-output-index={output.index}>
      Bit {output.index}: {Number(output.bit)} at tick {output.tick}. Report {output.signal}.
    </li>)}</ol> : <p>No sum bits have been emitted at this tick.</p>}
    <p data-testid="ark-selected">{visible.selected ? `Keeper consumed selected bit ${visible.selected.index}: ${Number(visible.selected.bit)} at tick ${visible.selected.tick}, report ${visible.selected.signal}.` : "Keeper has not consumed a matching selected report at this tick."}</p>
    <p data-testid="ark-decision">{visible.decision ? `At tick ${visible.decision.tick}, Keeper chose ${Number(visible.decision.bit)}. Payload ${visible.decision.delivered ? "delivered" : "not delivered"}.` : "The recorded service decision has not occurred at this tick."}</p>
    {visible.final ? <div data-testid="ark-verdict"><h3>Final checked result</h3>
      <p>Expected sum: {grade.expected_sum}. {grade.observed_sum === null ? `Recorded ${grade.outputs.length} outputs; the contract requires exactly five.` : `Recorded five-bit sum: ${grade.observed_sum}.`}</p>
      <ul><li>Arithmetic: {grade.arithmetic_passed ? "passed" : "failed"}.</li>
        <li>Selected bit retained across the outage: {grade.retained ? "yes" : "no"}.</li>
        <li>Physical service: {grade.service_passed ? "passed" : "failed"}.</li>
        <li>Whole control contract: {grade.control_passed ? "passed" : "failed"}.</li></ul>
      <p>The Rust checker evaluates all five outputs and the physical decision. This browser displays the published grade.</p>
    </div> : <p data-testid="ark-pending">Follow the record to its final frame for the complete arithmetic and service verdict.</p>}
  </section>;
}
