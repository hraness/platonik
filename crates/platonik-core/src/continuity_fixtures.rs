//! A single bounded service habitat with changing physical reports.
//! Public recipes are qualification/transfer cases, not blinded evidence.
use crate::fixtures;
use crate::model::*;

const TRAINING: &[&str] = &[
    "changing-one",
    "changing-zero",
    "broken-crossing",
    "slow-radio",
];
const TRANSFER: &[&str] = &[
    "early-crossing",
    "reversed-crossing",
    "repeated-reports",
    "late-crossing",
];
const ALL: &[&str] = &[
    "changing-one",
    "changing-zero",
    "broken-crossing",
    "slow-radio",
    "early-crossing",
    "reversed-crossing",
    "repeated-reports",
    "late-crossing",
];
pub const HORIZON: u32 = 96;
pub const PAUSE_CUTS: &[u32] = &[5, 9, 14, 19, 27, 47, 79, HORIZON];

pub fn case_ids() -> &'static [&'static str] {
    ALL
}
pub fn training_ids() -> &'static [&'static str] {
    TRAINING
}
pub fn transfer_ids() -> &'static [&'static str] {
    TRANSFER
}

fn habitat(bits: [bool; 6], delay: u32, seed: u64) -> Experiment {
    let mut experiment = fixtures::experiment("ark-plan-a").expect("public ark exists");
    experiment.version = HAZARD_VERSION;
    experiment.seed = seed;
    experiment.ticks = HORIZON;
    experiment.sources[0].sparks = bits
        .into_iter()
        .enumerate()
        .map(|(index, bit)| Spark {
            id: index as u32 + 1,
            bit,
        })
        .collect();
    // The report always describes the sole physically buffered spark. A failed
    // full-depot Drop emits no new report; cargo remains with the courier.
    experiment.depots[0].capacity = 1;
    for beacon in &mut experiment.beacons {
        beacon.initial_charge = 12;
        beacon.spark_charge = 6;
        beacon.required_deliveries = 3;
    }
    for link in &mut experiment.links {
        link.delay = delay;
    }
    experiment.events = vec![
        Event {
            tick: 15,
            event: EventKind::LinkEnabled {
                id: 41,
                enabled: false,
            },
        },
        Event {
            tick: 19,
            event: EventKind::LinkEnabled {
                id: 41,
                enabled: true,
            },
        },
        Event {
            tick: 19,
            event: EventKind::ValveEnabled {
                id: 30,
                enabled: true,
            },
        },
    ];
    experiment
}

fn crossing(experiment: &mut Experiment, close: u32, reopen: u32) {
    let edge = Edge::new(Point { x: 3, y: 2 }, Point { x: 4, y: 2 });
    for (tick, blocked) in [(close, true), (reopen, false)] {
        experiment.events.push(Event {
            tick,
            event: EventKind::EdgeBlocked { edge, blocked },
        });
    }
    experiment.events.sort_by_key(|event| event.tick);
}

fn rotate(experiment: &mut Experiment) {
    let (width, height) = (experiment.width, experiment.height);
    let point = |p: Point| Point {
        x: width - 1 - p.x,
        y: height - 1 - p.y,
    };
    for wall in &mut experiment.walls {
        *wall = point(*wall);
    }
    for source in &mut experiment.sources {
        source.position = point(source.position);
    }
    for depot in &mut experiment.depots {
        depot.position = point(depot.position);
    }
    for beacon in &mut experiment.beacons {
        beacon.position = point(beacon.position);
    }
    for valve in &mut experiment.valves {
        valve.position = point(valve.position);
    }
    for cell in &mut experiment.cells {
        cell.position = point(cell.position);
        cell.heading = match cell.heading {
            Direction::North => Direction::South,
            Direction::East => Direction::West,
            Direction::South => Direction::North,
            Direction::West => Direction::East,
        };
    }
    for event in &mut experiment.events {
        if let EventKind::EdgeBlocked { edge, .. } = &mut event.event {
            *edge = Edge::new(point(edge.a), point(edge.b));
        }
    }
}

pub fn experiment(id: &str) -> Result<Experiment, String> {
    let mut world = match id {
        "changing-one" => habitat([true, false, true, false, true, false], 1, 0),
        "changing-zero" => habitat([false, true, false, true, false, true], 1, 0),
        "broken-crossing" => habitat([true, true, false, true, false, false], 1, 0),
        "slow-radio" => habitat([false, false, true, false, true, true], 3, 0),
        "early-crossing" => habitat([true, false, true, false, true, false], 1, 0),
        "reversed-crossing" => habitat([false, true, false, true, false, true], 1, 29),
        "repeated-reports" => habitat([true, true, false, false, true, false], 3, 17),
        "late-crossing" => habitat([false, true, true, false, false, true], 3, 29),
        _ => return Err(format!("unknown continuous habitat fixture: {id}")),
    };
    match id {
        "broken-crossing" => crossing(&mut world, 10, 34),
        "early-crossing" => crossing(&mut world, 3, 30),
        "reversed-crossing" => {
            crossing(&mut world, 27, 88);
            rotate(&mut world);
        }
        "late-crossing" => crossing(&mut world, 39, 88),
        _ => {}
    }
    Ok(world)
}

/// A legal, deliberately signal-blind baseline. Wrong routes retain FIFO stock,
/// so alternating attempts may compete with a report-driven controller.
pub fn blind_alternator() -> Program {
    Program {
        rules: vec![
            Rule {
                when: vec![Condition::Memory { slot: 0, value: 0 }],
                action: Action::Route {
                    valve: 30,
                    bit: BitSource::Constant { value: false },
                },
                remember: Some(MemoryWrite { slot: 0, value: 1 }),
            },
            Rule {
                when: vec![],
                action: Action::Route {
                    valve: 30,
                    bit: BitSource::Constant { value: true },
                },
                remember: Some(MemoryWrite { slot: 0, value: 0 }),
            },
        ],
    }
}
