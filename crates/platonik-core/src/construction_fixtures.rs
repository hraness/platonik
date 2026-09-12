//! Public, finite same-world construction recipes. These are supplied tasks,
//! not hidden tests or evidence of autonomous blueprint discovery.
use crate::model::*;

pub const BUILDER: u16 = 5;
pub const CHILD: u16 = 3;
pub const BLUEPRINT: u16 = 50;
pub const STOCK: u16 = 60;
pub const MATERIAL: u32 = 1001;
pub const HORIZON: u32 = 128;

const TRAINING: &[&str] = &[
    "construction-one",
    "construction-zero",
    "construction-slow",
    "construction-crossing",
];
const TRANSFER: &[&str] = &[
    "construction-rotated-one",
    "construction-rotated-zero",
    "construction-rotated-slow",
    "construction-rotated-crossing",
];
const ALL: &[&str] = &[
    "construction-one",
    "construction-zero",
    "construction-slow",
    "construction-crossing",
    "construction-rotated-one",
    "construction-rotated-zero",
    "construction-rotated-slow",
    "construction-rotated-crossing",
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

/// Exact selected navigation program, including its supplied-launch-bearing
/// assumption. Only the admitted body's position and heading change by recipe.
pub fn courier_program() -> Program {
    serde_json::from_str(include_str!(
        "../../../fixtures/evidence/navigation-repair-submissions/compass-goal-heading.json"
    ))
    .expect("the published navigation winner is a typed Program")
}

/// The previously evaluated two-rule Keeper. This is a supplied finite program,
/// copied as part of the full child body; it is not generated inside the world.
pub fn child_program() -> Program {
    let previous: Experiment = serde_json::from_str(include_str!(
        "../../../fixtures/evidence/continuity-inputs/previous-resilient--changing-one.json"
    ))
    .expect("the published earlier crew is a typed Experiment");
    previous
        .cells
        .into_iter()
        .find(|cell| cell.id == CHILD)
        .expect("the earlier crew has Keeper")
        .program
}

fn rule(when: Vec<Condition>, action: Action) -> Rule {
    Rule {
        when,
        action,
        remember: None,
    }
}

/// A builder follows local assembly stages. No tick, recipe name, or delivery
/// timetable is available to its policy; every observation and action is charged.
pub fn builder_program() -> Program {
    Program {
        rules: vec![
            rule(
                vec![Condition::AssemblyStage {
                    blueprint: BLUEPRINT,
                    stage: AssemblyStage::Born,
                }],
                Action::Wait,
            ),
            rule(
                vec![Condition::AssemblyStage {
                    blueprint: BLUEPRINT,
                    stage: AssemblyStage::Ready,
                }],
                Action::Activate {
                    blueprint: BLUEPRINT,
                },
            ),
            rule(
                vec![
                    Condition::AssemblyStage {
                        blueprint: BLUEPRINT,
                        stage: AssemblyStage::Absent,
                    },
                    Condition::HasMaterial { value: false },
                ],
                Action::GatherMaterial { stock: STOCK },
            ),
            rule(
                vec![],
                Action::Build {
                    blueprint: BLUEPRINT,
                },
            ),
        ],
    }
}

fn rotate(world: &mut Experiment) {
    let (width, height) = (world.width, world.height);
    let point = |p: Point| Point {
        x: width - 1 - p.x,
        y: height - 1 - p.y,
    };
    let cell = |c: &mut Cell| {
        c.position = point(c.position);
        c.heading = match c.heading {
            Direction::North => Direction::South,
            Direction::East => Direction::West,
            Direction::South => Direction::North,
            Direction::West => Direction::East,
        };
    };
    world.walls.iter_mut().for_each(|p| *p = point(*p));
    world.cells.iter_mut().for_each(&cell);
    for source in &mut world.sources {
        source.position = point(source.position);
    }
    for depot in &mut world.depots {
        depot.position = point(depot.position);
    }
    for beacon in &mut world.beacons {
        beacon.position = point(beacon.position);
    }
    for valve in &mut world.valves {
        valve.position = point(valve.position);
    }
    for event in &mut world.events {
        if let EventKind::EdgeBlocked { edge, .. } = &mut event.event {
            *edge = Edge::new(point(edge.a), point(edge.b));
        }
    }
    if let Some(construction) = &mut world.construction {
        for stock in &mut construction.stocks {
            stock.position = point(stock.position);
        }
        for blueprint in &mut construction.blueprints {
            cell(&mut blueprint.body.cell);
        }
    }
}

pub fn experiment(id: &str) -> Result<Experiment, String> {
    let (bits, delay, seed, crossing, rotated) = match id {
        "construction-one" => ([true, false, true, false, true, false], 14, 0, false, false),
        "construction-zero" => ([false, true, false, true, false, true], 14, 0, false, false),
        "construction-slow" => (
            [true, true, false, false, true, false],
            16,
            17,
            false,
            false,
        ),
        "construction-crossing" => ([false, true, true, false, false, true], 14, 29, true, false),
        "construction-rotated-one" => {
            ([true, false, true, false, true, false], 14, 29, false, true)
        }
        "construction-rotated-zero" => {
            ([false, true, false, true, false, true], 14, 17, false, true)
        }
        "construction-rotated-slow" => {
            ([true, true, false, false, true, false], 16, 29, false, true)
        }
        "construction-rotated-crossing" => {
            ([false, true, true, false, false, true], 14, 17, true, true)
        }
        _ => return Err(format!("unknown construction habitat fixture: {id}")),
    };
    let mut world = crate::continuity_fixtures::experiment("changing-one")?;
    world.version = CONSTRUCTION_VERSION;
    world.seed = seed;
    world.ticks = HORIZON;
    world.fuel = 40_000;
    world.events.clear();
    world.sources[0].sparks = bits
        .into_iter()
        .enumerate()
        .map(|(i, bit)| Spark {
            id: i as u32 + 1,
            bit,
        })
        .collect();
    for beacon in &mut world.beacons {
        beacon.initial_charge = 20;
    }
    world.valves[0].enabled = true;
    world
        .links
        .iter_mut()
        .find(|link| link.id == 40)
        .unwrap()
        .delay = delay;
    world
        .cells
        .iter_mut()
        .find(|cell| cell.id == 1)
        .unwrap()
        .program = courier_program();
    let mut child = world.cells.remove(
        world
            .cells
            .iter()
            .position(|cell| cell.id == CHILD)
            .unwrap(),
    );
    child.program = child_program();
    let child_link = world
        .links
        .remove(world.links.iter().position(|link| link.id == 41).unwrap());
    // Opening one isolated floor tile creates a local building site without
    // changing the inherited courier's corridor or its source/depot endpoints.
    let site = Point { x: 6, y: 0 };
    world.walls.retain(|point| *point != site);
    world.cells.push(Cell {
        id: BUILDER,
        position: site,
        heading: Direction::South,
        mobile: false,
        memory: [0; 4],
        program: builder_program(),
    });
    world.construction = Some(ConstructionSpec {
        stocks: vec![MaterialStock {
            id: STOCK,
            position: site,
            units: vec![MATERIAL],
        }],
        blueprints: vec![Blueprint {
            id: BLUEPRINT,
            body: BlueprintBody {
                cell: child,
                links: vec![child_link],
            },
        }],
    });
    if crossing {
        let edge = Edge::new(Point { x: 3, y: 2 }, Point { x: 4, y: 2 });
        world.events = vec![
            Event {
                tick: 27,
                event: EventKind::EdgeBlocked {
                    edge,
                    blocked: true,
                },
            },
            Event {
                tick: 50,
                event: EventKind::EdgeBlocked {
                    edge,
                    blocked: false,
                },
            },
        ];
    }
    // The reference frame is the previously tested westward launch. Transfer
    // recipes use its 180-degree rotation and declared alternate scheduler seeds.
    rotate(&mut world);
    if rotated {
        rotate(&mut world);
    }
    Ok(world)
}
