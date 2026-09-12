//! A supplied, finite construction-to-contact journey. The reply transports the
//! provenance of a physical depot delivery; it does not create energy or prove
//! intelligence, distant life, or autonomous blueprint discovery.
use crate::{construction_fixtures, model::*};

pub const COURIER: u16 = 1;
pub const RELAY: u16 = 2;
pub const KEEPER: u16 = 3;
pub const BUILDER: u16 = 5;
pub const REPLY: u16 = 6;
pub const RECEIVER: u16 = 7;
pub const KEEPER_BLUEPRINT: u16 = 50;
pub const REPLY_BLUEPRINT: u16 = 51;
pub const STOCK: u16 = 60;
pub const KEEPER_MATERIAL: u32 = 1001;
pub const REPLY_MATERIAL: u32 = 1002;
pub const INCOMING_LINK: u16 = 42;
pub const RETURN_LINK: u16 = 43;
pub const RETURN_PORT: u8 = 0;
pub const HORIZON: u32 = 128;

const TRAINING: &[&str] = &[
    "answer-one",
    "answer-zero",
    "answer-slow",
    "answer-crossing",
];
const TRANSFER: &[&str] = &[
    "answer-rotated-one",
    "answer-rotated-zero",
    "answer-rotated-slow",
    "answer-rotated-crossing",
];
const ALL: &[&str] = &[
    "answer-one",
    "answer-zero",
    "answer-slow",
    "answer-crossing",
    "answer-rotated-one",
    "answer-rotated-zero",
    "answer-rotated-slow",
    "answer-rotated-crossing",
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

fn rule(when: Vec<Condition>, action: Action) -> Rule {
    Rule {
        when,
        action,
        remember: None,
    }
}
fn stage(blueprint: u16, stage: AssemblyStage) -> Condition {
    Condition::AssemblyStage { blueprint, stage }
}

/// First complete the inherited Keeper, then assemble the local reply cell.
/// Both targets are adjacent to the immobile builder. No global tick, coordinate
/// reading, recipe name, or privileged construction action is available.
pub fn builder_program() -> Program {
    Program {
        rules: vec![
            rule(
                vec![stage(KEEPER_BLUEPRINT, AssemblyStage::Ready)],
                Action::Activate {
                    blueprint: KEEPER_BLUEPRINT,
                },
            ),
            rule(
                vec![
                    stage(KEEPER_BLUEPRINT, AssemblyStage::Absent),
                    Condition::HasMaterial { value: false },
                ],
                Action::GatherMaterial { stock: STOCK },
            ),
            rule(
                vec![
                    stage(KEEPER_BLUEPRINT, AssemblyStage::Born),
                    stage(REPLY_BLUEPRINT, AssemblyStage::Born),
                ],
                Action::Wait,
            ),
            rule(
                vec![
                    stage(KEEPER_BLUEPRINT, AssemblyStage::Born),
                    stage(REPLY_BLUEPRINT, AssemblyStage::Ready),
                ],
                Action::Activate {
                    blueprint: REPLY_BLUEPRINT,
                },
            ),
            rule(
                vec![
                    stage(KEEPER_BLUEPRINT, AssemblyStage::Born),
                    stage(REPLY_BLUEPRINT, AssemblyStage::Absent),
                    Condition::HasMaterial { value: false },
                ],
                Action::GatherMaterial { stock: STOCK },
            ),
            rule(
                vec![stage(KEEPER_BLUEPRINT, AssemblyStage::Born)],
                Action::Build {
                    blueprint: REPLY_BLUEPRINT,
                },
            ),
            rule(
                vec![],
                Action::Build {
                    blueprint: KEEPER_BLUEPRINT,
                },
            ),
        ],
    }
}

/// Retain the latest received bit and its physical-delivery provenance, then
/// resend it locally. Initial zero memory has no provenance and earns no answer.
/// A direct message-forwarding program is also legal; memory is not an unlock.
pub fn reply_program() -> Program {
    Program {
        rules: vec![
            rule(
                vec![Condition::HasMessage {
                    port: 0,
                    value: true,
                }],
                Action::TakeMessage { port: 0, slot: 0 },
            ),
            rule(
                vec![],
                Action::Send {
                    port: RETURN_PORT,
                    bit: BitSource::Memory { slot: 0 },
                },
            ),
        ],
    }
}

pub fn receiver_program() -> Program {
    Program {
        rules: vec![
            rule(
                vec![Condition::HasMessage {
                    port: RETURN_PORT,
                    value: true,
                }],
                Action::TakeMessage {
                    port: RETURN_PORT,
                    slot: 0,
                },
            ),
            rule(vec![], Action::Wait),
        ],
    }
}

pub fn experiment(id: &str) -> Result<Experiment, String> {
    if !ALL.contains(&id) {
        return Err(format!("unknown answer habitat fixture: {id}"));
    }
    let inherited_id = id.replacen("answer-", "construction-", 1);
    let mut world = construction_fixtures::experiment(&inherited_id)?;
    let rotated = id.starts_with("answer-rotated-");
    let point = |x: u8, y: u8| {
        if rotated {
            Point {
                x: world.width - 1 - x,
                y: world.height - 1 - y,
            }
        } else {
            Point { x, y }
        }
    };
    let reply_position = point(3, 4);
    let receiver_position = point(4, 4);
    world
        .walls
        .retain(|point| *point != reply_position && *point != receiver_position);
    world
        .cells
        .iter_mut()
        .find(|cell| cell.id == BUILDER)
        .unwrap()
        .program = builder_program();
    world.cells.push(Cell {
        id: RECEIVER,
        position: receiver_position,
        heading: if rotated {
            Direction::East
        } else {
            Direction::West
        },
        mobile: false,
        memory: [0; 4],
        program: receiver_program(),
    });
    let construction = world.construction.as_mut().unwrap();
    construction.stocks[0].units.push(REPLY_MATERIAL);
    construction.blueprints.push(Blueprint {
        id: REPLY_BLUEPRINT,
        body: BlueprintBody {
            cell: Cell {
                id: REPLY,
                position: reply_position,
                heading: if rotated {
                    Direction::East
                } else {
                    Direction::West
                },
                mobile: false,
                memory: [0; 4],
                program: reply_program(),
            },
            links: vec![
                Link {
                    id: INCOMING_LINK,
                    from: Endpoint::Cell { id: RELAY, port: 0 },
                    to_cell: REPLY,
                    to_port: 0,
                    delay: 1,
                    enabled: true,
                },
                Link {
                    id: RETURN_LINK,
                    from: Endpoint::Cell {
                        id: REPLY,
                        port: RETURN_PORT,
                    },
                    to_cell: RECEIVER,
                    to_port: RETURN_PORT,
                    delay: 3,
                    enabled: true,
                },
            ],
        },
    });
    Ok(world)
}
