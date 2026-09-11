//! Public, predeclared v2 expedition cases. Source visibility is intentional:
//! transfer testing here is neither secret nor blinded scientific evaluation.
use crate::fixtures;
use crate::model::*;

const TRAINING: &[&str] = &[
    "opening-normal",
    "opening-collapse",
    "ark-plan-a",
    "ark-plan-b",
];
const TRANSFER: &[&str] = &[
    "transfer-early-collapse",
    "transfer-reversed-collapse",
    "transfer-delayed-plan-a",
    "transfer-delayed-plan-b",
];
const ALL: &[&str] = &[
    "opening-normal",
    "opening-collapse",
    "ark-plan-a",
    "ark-plan-b",
    "transfer-early-collapse",
    "transfer-reversed-collapse",
    "transfer-delayed-plan-a",
    "transfer-delayed-plan-b",
];

pub fn case_ids() -> &'static [&'static str] {
    ALL
}
pub fn training_ids() -> &'static [&'static str] {
    TRAINING
}
pub fn transfer_ids() -> &'static [&'static str] {
    TRANSFER
}
pub fn compact_program() -> Program {
    fixtures::compact_courier()
}
pub fn recovery_program() -> Program {
    fixtures::resilient_courier()
}
pub fn relay_program() -> Program {
    fixtures::relay_program()
}
pub fn controller_program() -> Program {
    fixtures::controller_program()
}

fn opening() -> Experiment {
    let mut experiment =
        fixtures::experiment("opening-normal-resilient").expect("public fixture exists");
    experiment.version = HAZARD_VERSION;
    experiment
}

fn collapse(tick: u32) -> Experiment {
    let mut experiment = opening();
    experiment.events.push(Event {
        tick,
        event: EventKind::EdgeBlocked {
            edge: Edge::new(Point { x: 3, y: 2 }, Point { x: 4, y: 2 }),
            blocked: true,
        },
    });
    experiment
}

fn turn_around(experiment: &mut Experiment) {
    let width = experiment.width;
    let height = experiment.height;
    let rotate = |point: Point| Point {
        x: width - 1 - point.x,
        y: height - 1 - point.y,
    };
    for wall in &mut experiment.walls {
        *wall = rotate(*wall);
    }
    for source in &mut experiment.sources {
        source.position = rotate(source.position);
    }
    for depot in &mut experiment.depots {
        depot.position = rotate(depot.position);
    }
    for beacon in &mut experiment.beacons {
        beacon.position = rotate(beacon.position);
    }
    for valve in &mut experiment.valves {
        valve.position = rotate(valve.position);
    }
    for cell in &mut experiment.cells {
        cell.position = rotate(cell.position);
        cell.heading = match cell.heading {
            Direction::North => Direction::South,
            Direction::East => Direction::West,
            Direction::South => Direction::North,
            Direction::West => Direction::East,
        };
    }
    for event in &mut experiment.events {
        if let EventKind::EdgeBlocked { edge, .. } = &mut event.event {
            *edge = Edge::new(rotate(edge.a), rotate(edge.b));
        }
    }
}

fn ark(bit: bool, delayed: bool) -> Experiment {
    let mut experiment = fixtures::experiment(if bit { "ark-plan-b" } else { "ark-plan-a" })
        .expect("public fixture exists");
    experiment.version = HAZARD_VERSION;
    if delayed {
        experiment.seed = 29;
        for link in &mut experiment.links {
            link.delay = 3;
        }
    }
    experiment
}

/// Every case contains the same feasible public recovery policy. Candidate
/// evaluation substitutes admitted policies while holding the rest fixed.
pub fn experiment(id: &str) -> Result<Experiment, String> {
    match id {
        "opening-normal" => Ok(opening()),
        "opening-collapse" => Ok(collapse(10)),
        "ark-plan-a" => Ok(ark(false, false)),
        "ark-plan-b" => Ok(ark(true, false)),
        "transfer-early-collapse" => Ok(collapse(3)),
        "transfer-reversed-collapse" => {
            let mut experiment = collapse(27);
            turn_around(&mut experiment);
            Ok(experiment)
        }
        "transfer-delayed-plan-a" => Ok(ark(false, true)),
        "transfer-delayed-plan-b" => Ok(ark(true, true)),
        _ => Err(format!("unknown expedition fixture: {id}")),
    }
}
