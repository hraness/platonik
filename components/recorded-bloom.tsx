import { bloomAt, type BloomGrade } from "@/lib/bridge/bloom";

export function RecordedBloom({ grade, tick }: { grade: BloomGrade; tick: number }) {
  const visible = bloomAt(grade, tick);
  return <section className="continuity-stops" aria-labelledby="bloom-progress-title" data-testid="bloom-progress">
    <h2 id="bloom-progress-title">Make a variation. Let the world answer.</h2>
    <p>Both couriers begin with the same seed program. Their builders change direction instructions before birth. A successful first trip can earn another request, whose result remains a separate test.</p>
    {grade.candidates.map(item => {
      const reached = visible.candidates.find(value => value.id === item.id)!;
      return <div key={item.id} data-bloom-candidate={item.id}>
        <h3>Candidate {item.id + 1}: courier {item.child}</h3>
        <p>Builder {item.builder} works on blueprint {item.blueprint}. Trial parcel {item.trial_parcel} and confirmation parcel {item.confirmation_parcel} wait at source {item.source}; depot {item.depot} records their handoffs.</p>
        {reached.edits.length ? <ul aria-label={`Candidate ${item.id + 1} recorded edits`}>{reached.edits.map((edit, index) => <li key={`${edit.tick}-${index}`} data-bloom-edit={index}>At tick {edit.tick}, builder {edit.actor} changed rule {edit.rule} using register {edit.slot}: direction {["forward", "left", "right", "back"][edit.value]}. It wrote {edit.bytes_written} body bytes.</li>)}</ul> : <p data-bloom-moment="edits">No program change has been recorded at this tick.</p>}
        <ul aria-label={`Candidate ${item.id + 1} recorded moments`}>
          <li data-bloom-moment="born">{reached.born !== null ? `Courier activated at tick ${reached.born}.` : "Courier has not been activated at this tick."}</li>
          <li data-bloom-moment="trial_pickup">{reached.trial_pickup !== null ? `Trial parcel picked up at tick ${reached.trial_pickup}.` : "Trial parcel has not been picked up at this tick."}</li>
          <li data-bloom-moment="trial_departed">{reached.trial_departed !== null ? `Courier departed with the trial parcel at tick ${reached.trial_departed}.` : "Courier has not departed with the trial parcel at this tick."}</li>
          <li data-bloom-moment="trial_returned">{reached.trial_returned !== null ? `Courier returned from its trial at tick ${reached.trial_returned}.` : "Courier has not returned from its trial at this tick."}</li>
          <li data-bloom-moment="trial_accepted">{reached.trial_accepted !== null ? `Trial parcel accepted at the depot at tick ${reached.trial_accepted}.` : "Trial parcel has not been accepted at its depot at this tick."}</li>
          <li data-bloom-moment="trial_serviced">{reached.trial_serviced !== null ? `Trial parcel reached a service at tick ${reached.trial_serviced}.` : "Trial parcel has not reached a service at this tick."}</li>
          <li data-bloom-moment="confirmation_requested">{reached.confirmation_requested !== null ? `Courier consumed a confirmation request at tick ${reached.confirmation_requested}.` : "Courier has not consumed a confirmation request at this tick."}</li>
          <li data-bloom-moment="confirmation_pickup">{reached.confirmation_pickup !== null ? `Confirmation parcel picked up at tick ${reached.confirmation_pickup}.` : "Confirmation parcel has not been picked up at this tick."}</li>
          <li data-bloom-moment="confirmation_accepted">{reached.confirmation_accepted !== null ? `Confirmation parcel accepted at the depot at tick ${reached.confirmation_accepted}.` : "Confirmation parcel has not been accepted at its depot at this tick."}</li>
          <li data-bloom-moment="confirmation_serviced">{reached.confirmation_serviced !== null ? `Confirmation parcel reached a service at tick ${reached.confirmation_serviced}.` : "Confirmation parcel has not reached a service at this tick."}</li>
        </ul>
        <details className="lab-details"><summary>Candidate program identity</summary><p className="bridge-hash">Seed program: <code>{item.seed_program_hash}</code>{reached.program_hash && <><br />Born program: <code>{reached.program_hash}</code></>}</p></details>
        {visible.final && <p data-testid="bloom-candidate-verdict">Changed program: {item.changed ? "yes" : "no"}. Permitted family: {item.family_passed ? "passed" : "failed"}. Physical trial: {item.trial_passed ? "passed" : "failed"}. Confirmation: {item.confirmation_passed ? "passed" : "not earned"}.</p>}
      </div>;
    })}
    <p data-testid="bloom-selection">{visible.selection ? `At tick ${visible.selection.tick}, the selector chose candidate ${visible.selection.candidate + 1}, courier ${visible.selection.child}, after consuming report ${visible.selection.signal} from parcel ${visible.selection.parcel}.` : "The selector has not consumed a qualifying trial report at this tick."}</p>
    {visible.final ? <div data-testid="bloom-verdict"><h3>Final checked result</h3>
      <ul><li>Local program generation: {grade.generated_passed ? "passed" : "failed"}.</li>
        <li>Physical trials: {grade.trials_passed ? "passed" : "failed"}.</li>
        <li>Selection from trial evidence: {grade.selection_passed ? "passed" : "failed"}.</li>
        <li>Later confirmation: {grade.confirmation_passed ? "passed" : "failed"}.</li>
        <li>Physical service: {grade.service_passed ? "passed" : "failed"}.</li>
        <li>Whole Bloom contract: {grade.bloomed ? "passed" : "failed"}.</li></ul>
      <p>The Rust checker binds changed programs and physical evidence to one complete history. This browser displays its published grade.</p>
    </div> : <p data-testid="bloom-pending">Follow the record to its final frame for the complete generation, trials, selection, and confirmation verdict.</p>}
  </section>;
}
