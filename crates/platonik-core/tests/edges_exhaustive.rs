//! Exhaustive only over the stated local 2×2 domain, not the full habitat state space.
use platonik_core::{check, model::*, run};

fn point(x: u8, y: u8) -> Point {
    Point { x, y }
}

#[test]
fn all_two_by_two_closures_positions_headings_and_relative_moves_match_an_independent_oracle() {
    let edges = [
        Edge::new(point(0, 0), point(1, 0)),
        Edge::new(point(0, 0), point(0, 1)),
        Edge::new(point(1, 0), point(1, 1)),
        Edge::new(point(0, 1), point(1, 1)),
    ];
    let headings = [
        Direction::North,
        Direction::East,
        Direction::South,
        Direction::West,
    ];
    let relative = [
        Relative::Forward,
        Relative::Right,
        Relative::Back,
        Relative::Left,
    ];
    let mut checked = 0;
    for closed_mask in 0..16u8 {
        for position in 0..4u8 {
            for (heading, &heading_value) in headings.iter().enumerate() {
                for (turn, &relative_value) in relative.iter().enumerate() {
                    let start = point(position % 2, position / 2);
                    // This oracle uses integer directions and unordered endpoint pairs,
                    // never policy::destination/blocked or the engine's Edge constructor.
                    let (dx, dy) = [(0i16, -1i16), (1, 0), (0, 1), (-1, 0)][(heading + turn) % 4];
                    let target = (i16::from(start.x) + dx, i16::from(start.y) + dy);
                    let outside = !(0..2).contains(&target.0) || !(0..2).contains(&target.1);
                    let closed = edges.iter().enumerate().any(|(index, edge)| {
                        let a = (i16::from(edge.a.x), i16::from(edge.a.y));
                        let b = (i16::from(edge.b.x), i16::from(edge.b.y));
                        let from = (i16::from(start.x), i16::from(start.y));
                        closed_mask & (1 << index) != 0
                            && ((a == from && b == target) || (b == from && a == target))
                    });
                    let expected_blocked = outside || closed;
                    let expected_position = if expected_blocked {
                        start
                    } else {
                        point(target.0 as u8, target.1 as u8)
                    };
                    for guarded in [false, true] {
                        let mut rules = Vec::new();
                        if guarded {
                            rules.push(Rule {
                                when: vec![Condition::Blocked {
                                    direction: relative_value,
                                    value: true,
                                }],
                                action: Action::Wait,
                                remember: None,
                            });
                        }
                        rules.push(Rule {
                            when: vec![],
                            action: Action::Move {
                                direction: relative_value,
                            },
                            remember: None,
                        });
                        let experiment = Experiment {
                            version: HAZARD_VERSION,
                            seed: 7,
                            width: 3,
                            height: 3,
                            walls: vec![point(2, 0), point(2, 1), point(0, 2), point(1, 2)],
                            sources: vec![],
                            depots: vec![],
                            valves: vec![],
                            links: vec![],
                            beacons: vec![Beacon {
                                id: 1,
                                position: point(2, 2),
                                accepts: false,
                                initial_charge: 2,
                                drain_every: 1,
                                drain_amount: 1,
                                spark_charge: 1,
                                required_deliveries: 0,
                            }],
                            cells: vec![Cell {
                                id: 1,
                                position: start,
                                heading: heading_value,
                                mobile: true,
                                memory: [0; 4],
                                program: Program { rules },
                            }],
                            events: edges
                                .iter()
                                .enumerate()
                                .filter(|(index, _)| closed_mask & (1 << index) != 0)
                                .map(|(_, edge)| Event {
                                    tick: 1,
                                    event: EventKind::EdgeBlocked {
                                        edge: *edge,
                                        blocked: true,
                                    },
                                })
                                .collect(),
                            ticks: 1,
                            fuel: 10_000,
                            activation_fuel: 128,
                            construction: None,
                            facilities: Vec::new(),
                        };
                        let result = run(&experiment).unwrap();
                        let context = format!(
                            "mask={closed_mask}, position={position}, heading={heading}, turn={turn}, guarded={guarded}"
                        );
                        assert_eq!(result.status, RunStatus::Complete, "{context}");
                        assert_eq!(
                            result.final_state.cells[0].position, expected_position,
                            "{context}"
                        );
                        let action = &result.frames[1].activations[0];
                        assert_eq!(action.success, guarded || !expected_blocked, "{context}");
                        assert_eq!(
                            matches!(action.action, Action::Wait),
                            guarded && expected_blocked,
                            "{context}"
                        );
                        assert!(action.work_after > action.work_before, "{context}");
                        check::validate_result(&experiment, &result)
                            .unwrap_or_else(|error| panic!("{context}: {error}"));
                        checked += 1;
                    }
                }
            }
        }
    }
    assert_eq!(checked, 2_048);
}
