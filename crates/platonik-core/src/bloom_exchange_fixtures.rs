//! Fresh generated couriers completing a request/report/acknowledgment exchange.
//!
//! These are new v4 experiments. The old Bloom and Ports fixtures and their
//! grades are unchanged; this protocol neither concatenates their receipts nor
//! claims to implement the two-lane port-commitment contract.
use crate::{bloom_fixtures as bloom, model::*};

pub use bloom::{BERTHS, EDIT_RULES, FUEL, HORIZON, KEEPER, RELAY, SELECTION_SLOT, SELECTOR};
pub const REQUESTER: u16 = 8;
pub const CLOCK: u16 = 9;
pub const REQUEST_OPENS: u32 = 96;
pub const SERVICE_OPENS: u32 = 126;
pub const REQUEST_LINK: u16 = 48;
pub const WAKE_LINK: u16 = 49;
pub const ACK_LINK: u16 = 52;
pub const CHILD_ACK_LINKS: [u16; 2] = [53, 54];
pub const REQUESTER_ACK_SLOT: usize = 2;
pub const CHILD_REPORT_SLOT: usize = 3;

pub fn case_ids() -> &'static [&'static str] {
    &[
        "bloom-exchange-left",
        "bloom-exchange-right",
        "bloom-exchange-left-delay",
        "bloom-exchange-right-delay",
        "bloom-exchange-rotated-left",
        "bloom-exchange-rotated-right",
    ]
}
fn memory(slot: u8, value: u8) -> Condition {
    Condition::Memory { slot, value }
}
fn message(port: u8, value: bool) -> Condition {
    Condition::MessageBit { port, value }
}
fn rule(when: Vec<Condition>, action: Action, remember: Option<(u8, u8)>) -> Rule {
    Rule {
        when,
        action,
        remember: remember.map(|(slot, value)| MemoryWrite { slot, value }),
    }
}

/// The builders edit the same two directional operands as before. The fresh
/// seed additionally receives a report and itself emits a receipt-backed ACK.
pub fn seed_program() -> Program {
    let mut program = bloom::seed_program();
    program.rules[8]
        .when
        .extend([memory(1, 0), message(0, true)]);
    program.rules.push(rule(
        vec![memory(0, 5), memory(1, 1), message(0, false)],
        Action::TakeMessage { port: 0, slot: 3 },
        Some((0, 6)),
    ));
    program.rules.push(rule(
        vec![memory(0, 6)],
        Action::Send {
            port: 1,
            bit: BitSource::Memory { slot: 3 },
        },
        None,
    ));
    program
}

/// A local typed adapter: latch one physical trial; consume a request; send
/// the selected child that request, its physical report, and relay its ACK.
pub fn selector_program() -> Program {
    let mut rules = vec![
        rule(vec![memory(0, 6)], Action::Wait, None),
        rule(
            vec![memory(0, 5)],
            Action::Send {
                port: 2,
                bit: BitSource::Memory { slot: 1 },
            },
            Some((0, 6)),
        ),
        rule(
            vec![memory(0, 4), message(3, false)],
            Action::TakeMessage { port: 3, slot: 1 },
            Some((0, 5)),
        ),
    ];
    for berth in BERTHS {
        let chosen = || memory(2, berth.id + 1);
        rules.extend([
            rule(
                vec![chosen(), memory(0, 3)],
                Action::Send {
                    port: berth.id,
                    bit: BitSource::Memory { slot: 1 },
                },
                Some((0, 4)),
            ),
            rule(
                vec![chosen(), memory(0, 2), message(berth.id, false)],
                Action::TakeMessage {
                    port: berth.id,
                    slot: 1,
                },
                Some((0, 3)),
            ),
            rule(
                vec![chosen(), memory(0, 1)],
                Action::Send {
                    port: berth.id,
                    bit: BitSource::Constant { value: true },
                },
                Some((0, 2)),
            ),
            rule(
                vec![chosen(), memory(0, 0), message(2, true)],
                Action::TakeMessage { port: 2, slot: 0 },
                None,
            ),
        ]);
    }
    for berth in BERTHS {
        let mut when = BERTHS
            .iter()
            .map(|b| Condition::AssemblyStage {
                blueprint: b.blueprint,
                stage: AssemblyStage::Born,
            })
            .collect::<Vec<_>>();
        when.extend([memory(2, 0), message(berth.id, false)]);
        rules.push(rule(
            when,
            Action::TakeMessage {
                port: berth.id,
                slot: 1,
            },
            Some((2, berth.id + 1)),
        ));
    }
    Program { rules }
}

/// Requests begin on the external phase signal. A false ACK is consumed before
/// the next repeat; only the receipt checker can assess its physical ancestry.
pub fn requester_program() -> Program {
    Program {
        rules: vec![
            rule(vec![memory(0, 2)], Action::Wait, None),
            rule(
                vec![memory(0, 1), message(0, false)],
                Action::TakeMessage { port: 0, slot: 2 },
                Some((0, 2)),
            ),
            rule(
                vec![memory(0, 1)],
                Action::Send {
                    port: 0,
                    bit: BitSource::Constant { value: true },
                },
                None,
            ),
            rule(
                vec![memory(0, 0), message(1, true)],
                Action::TakeMessage { port: 1, slot: 0 },
                None,
            ),
        ],
    }
}
/// Retain the physical report while the service valve is closed, retrying the
/// charged route action until the fixed service window opens.
pub fn keeper_program() -> Program {
    let mut rules = Vec::new();
    for berth in BERTHS {
        rules.push(rule(
            vec![message(berth.id, false)],
            Action::TakeMessage {
                port: berth.id,
                slot: 1,
            },
            Some((0, berth.id + 1)),
        ));
    }
    for berth in BERTHS {
        rules.push(rule(
            vec![memory(0, berth.id + 1)],
            Action::Route {
                valve: berth.valve,
                bit: BitSource::Memory { slot: 1 },
            },
            None,
        ));
    }
    Program { rules }
}

fn link(id: u16, from: u16, port: u8, to_cell: u16, to_port: u8, delay: u32) -> Link {
    Link {
        id,
        from: Endpoint::Cell { id: from, port },
        to_cell,
        to_port,
        delay,
        enabled: true,
    }
}

pub fn experiment(id: &str) -> Result<Experiment, String> {
    let (base, delay) = match id {
        "bloom-exchange-left" => ("bloom-left", 1),
        "bloom-exchange-right" => ("bloom-right", 1),
        "bloom-exchange-left-delay" => ("bloom-left-delay", 2),
        "bloom-exchange-right-delay" => ("bloom-right-delay", 2),
        "bloom-exchange-rotated-left" => ("bloom-rotated-left", 3),
        "bloom-exchange-rotated-right" => ("bloom-rotated-right", 3),
        _ => return Err(format!("unknown Bloom exchange fixture: {id}")),
    };
    let mut world = bloom::experiment(base)?;
    world
        .cells
        .iter_mut()
        .find(|c| c.id == SELECTOR)
        .unwrap()
        .program = selector_program();
    world
        .cells
        .iter_mut()
        .find(|c| c.id == KEEPER)
        .unwrap()
        .program = keeper_program();
    let requester = world.cells.iter_mut().find(|c| c.id == REQUESTER).unwrap();
    requester.program = requester_program();
    let clock_position = Point {
        x: if requester.position.x > 5 { 7 } else { 3 },
        y: 4,
    };
    world.walls.retain(|p| *p != clock_position);
    world.cells.push(Cell {
        id: CLOCK,
        position: clock_position,
        heading: Direction::North,
        mobile: false,
        memory: [0; 4],
        program: Program {
            rules: vec![rule(
                vec![],
                Action::Send {
                    port: 0,
                    bit: BitSource::Constant { value: true },
                },
                None,
            )],
        },
    });
    world.links.retain(|l| l.id != REQUEST_LINK);
    world.events.retain(|e| {
        !matches!(
            e.event,
            EventKind::LinkEnabled {
                id: REQUEST_LINK,
                ..
            }
        )
    });
    world
        .links
        .push(link(REQUEST_LINK, REQUESTER, 0, SELECTOR, 2, 1));
    world
        .links
        .push(link(ACK_LINK, SELECTOR, 2, REQUESTER, 0, 1));
    let mut wake = link(WAKE_LINK, CLOCK, 0, REQUESTER, 1, 1);
    wake.enabled = false;
    world.links.push(wake);
    world.events.push(Event {
        tick: REQUEST_OPENS,
        event: EventKind::LinkEnabled {
            id: WAKE_LINK,
            enabled: true,
        },
    });
    for (index, blueprint) in world
        .construction
        .as_mut()
        .unwrap()
        .blueprints
        .iter_mut()
        .enumerate()
    {
        blueprint.body.cell.program = seed_program();
        blueprint.body.links.push(link(
            CHILD_ACK_LINKS[index],
            blueprint.body.cell.id,
            1,
            SELECTOR,
            3,
            delay,
        ));
    }
    for berth in BERTHS {
        world.events.push(Event {
            tick: REQUEST_OPENS,
            event: EventKind::ValveEnabled {
                id: berth.valve,
                enabled: false,
            },
        });
        world.events.push(Event {
            tick: SERVICE_OPENS,
            event: EventKind::ValveEnabled {
                id: berth.valve,
                enabled: true,
            },
        });
    }
    world.events.sort_by_key(|e| e.tick);
    Ok(world)
}

/// Named component-removal and deception controls are fresh, conserved engine
/// inputs. Being a valid experiment does not earn the exchange grade.
pub fn control_ids() -> &'static [&'static str] {
    &[
        "no-child-ack",
        "forged-report",
        "wrong-winner",
        "early-ack",
        "no-request",
        "missing-spare",
        "selector-bypass",
        "stray-report",
    ]
}

pub fn control(case_id: &str, kind: &str) -> Result<Experiment, String> {
    let mut world = experiment(case_id)?;
    match kind {
        "stray-report" => {
            let winner = u8::from(case_id.contains("right"));
            world
                .cells
                .iter_mut()
                .find(|c| c.id == SELECTOR)
                .unwrap()
                .program
                .rules
                .insert(
                    0,
                    rule(
                        vec![memory(2, winner + 1), memory(0, 0), memory(3, 0)],
                        Action::Send {
                            port: winner,
                            bit: BitSource::Constant { value: false },
                        },
                        Some((3, 1)),
                    ),
                );
        }
        "no-child-ack" => {
            for blueprint in &mut world.construction.as_mut().unwrap().blueprints {
                blueprint.body.cell.program.rules[10].action = Action::Wait;
            }
        }
        "forged-report" => {
            for rule in &mut world
                .cells
                .iter_mut()
                .find(|c| c.id == SELECTOR)
                .unwrap()
                .program
                .rules
            {
                if matches!(
                    rule.action,
                    Action::Send {
                        port: 0 | 1,
                        bit: BitSource::Memory { slot: 1 }
                    }
                ) {
                    rule.action = match rule.action {
                        Action::Send { port, .. } => Action::Send {
                            port,
                            bit: BitSource::Constant { value: false },
                        },
                        _ => unreachable!(),
                    };
                }
            }
        }
        "wrong-winner" => {
            for rule in &mut world
                .cells
                .iter_mut()
                .find(|c| c.id == SELECTOR)
                .unwrap()
                .program
                .rules
            {
                if let Action::Send {
                    port,
                    bit: BitSource::Constant { value: true },
                } = &mut rule.action
                {
                    *port = 1 - *port;
                }
            }
        }
        "early-ack" => {
            for rule in &mut world
                .cells
                .iter_mut()
                .find(|c| c.id == SELECTOR)
                .unwrap()
                .program
                .rules
            {
                if matches!(
                    rule.action,
                    Action::Send {
                        bit: BitSource::Constant { value: true },
                        ..
                    }
                ) {
                    rule.action = Action::Send {
                        port: 2,
                        bit: BitSource::Constant { value: false },
                    };
                    rule.remember = Some(MemoryWrite { slot: 0, value: 6 });
                }
            }
        }
        "no-request" => {
            world
                .cells
                .iter_mut()
                .find(|c| c.id == REQUESTER)
                .unwrap()
                .program = Program {
                rules: vec![rule(vec![], Action::Wait, None)],
            };
        }
        "selector-bypass" => {
            for rule in &mut world
                .cells
                .iter_mut()
                .find(|c| c.id == SELECTOR)
                .unwrap()
                .program
                .rules
            {
                if rule.action == (Action::TakeMessage { port: 2, slot: 0 }) {
                    rule.when.retain(|condition| *condition != message(2, true));
                    rule.action = Action::WriteMemory { slot: 0, value: 1 };
                }
            }
        }
        "missing-spare" => {
            let loser = BERTHS[usize::from(!case_id.contains("right"))];
            world
                .sources
                .iter_mut()
                .find(|s| s.id == loser.source)
                .unwrap()
                .sparks
                .retain(|s| s.id != loser.confirmation);
        }
        _ => return Err(format!("unknown Bloom exchange control: {kind}")),
    }
    Ok(world)
}
