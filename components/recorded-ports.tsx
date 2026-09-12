import { portsAt, type PortsGrade } from "@/lib/bridge/ports";

export function RecordedPorts({ grade, tick }: { grade: PortsGrade; tick: number }) {
  const visible = portsAt(grade, tick);
  return <section className="continuity-stops" aria-labelledby="ports-progress-title" data-testid="ports-progress">
    <h2 id="ports-progress-title">The parcel arrived. Does its requester know?</h2>
    <p>Two one-shot commitments travel through local couriers. A physical handoff and its acknowledgment are different events. Follow each recorded moment without treating a repeated request as permission to take the spare.</p>
    {grade.commitments.map(item => {
      const reached = visible.commitments.find(value => value.lane === item.lane)!;
      return <div key={item.lane} data-port-lane={item.lane}>
        <h3>Commitment {item.lane + 1}: parcel {item.parcel}</h3>
        <p>Requester {item.requester} asks courier {item.courier} to bring parcel {item.parcel} from source {item.source} to depot {item.depot}. Spare {item.spare} must stay at its source.</p>
        <ul aria-label={`Commitment ${item.lane + 1} recorded moments`}>
          <li data-port-moment="requested">{reached.requested ? `Request consumed at tick ${reached.requested.tick}, report ${reached.requested.signal}.` : "No matching request consumed at this tick."}</li>
          <li data-port-moment="picked-up">{reached.picked_up !== null ? `Parcel picked up at tick ${reached.picked_up}.` : "Parcel has not been picked up at this tick."}</li>
          <li data-port-moment="accepted">{reached.accepted !== null ? `Parcel accepted at depot ${item.depot} at tick ${reached.accepted}.` : "Parcel has not been accepted at its depot at this tick."}</li>
          <li data-port-moment="acknowledged">{reached.acknowledged ? `Requester consumed a matching acknowledgment at tick ${reached.acknowledged.tick}, report ${reached.acknowledged.signal}.` : "Requester has not consumed a matching acknowledgment at this tick."}</li>
          <li data-port-moment="serviced">{reached.serviced !== null ? `Parcel delivered to beacon ${item.beacon} at tick ${reached.serviced}.` : "Parcel has not reached its beacon at this tick."}</li>
        </ul>
        {visible.final && <div data-testid="ports-lane-verdict">
          <p>Request send attempts: {item.request_attempts}. Acknowledgment send attempts: {item.ack_attempts}. Attempts include failed sends; they are not extra parcels.</p>
          <p>Custody: {item.custody_passed ? "passed" : "failed"}. Acknowledgment: {item.acknowledgment_passed ? "passed" : "failed"}. Spare preserved: {item.spare_preserved ? "yes" : "no"}. Safety: {item.safety_passed ? "passed" : "failed"}.</p>
        </div>}
      </div>;
    })}
    {visible.final ? <div data-testid="ports-verdict"><h3>Final checked result</h3>
      <ul><li>Parcel custody: {grade.custody_passed ? "passed" : "failed"}.</li>
        <li>Matching acknowledgments: {grade.acknowledgments_passed ? "passed" : "failed"}.</li>
        <li>Commitment safety: {grade.safety_passed ? "passed" : "failed"}.</li>
        <li>Physical service: {grade.service_passed ? "passed" : "failed"}.</li>
        <li>Whole commitments contract: {grade.commitments_passed ? "passed" : "failed"}.</li></ul>
      <p>The Rust checker binds acknowledgments to physical handoffs and checks both complete histories. This browser displays its published grade.</p>
    </div> : <p data-testid="ports-pending">Follow the record to its final frame for attempt counts, spare preservation, and the complete commitments verdict.</p>}
  </section>;
}
