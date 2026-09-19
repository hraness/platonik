//! Compile a player's finite freight circuit into ordinary, editable policy.
//! Route drawing neither moves a carrier nor runs an alternate simulation.
use crate::{construction, model::*, policy, sim, world, world_fixtures};
use std::collections::BTreeMap;

fn direction(a: Point, b: Point) -> Result<Direction, String> {
    match (a.x.cmp(&b.x), a.y.cmp(&b.y)) {
        (std::cmp::Ordering::Less, std::cmp::Ordering::Equal) => Ok(Direction::East),
        (std::cmp::Ordering::Greater, std::cmp::Ordering::Equal) => Ok(Direction::West),
        (std::cmp::Ordering::Equal, std::cmp::Ordering::Less) => Ok(Direction::South),
        (std::cmp::Ordering::Equal, std::cmp::Ordering::Greater) => Ok(Direction::North),
        _ => Err("Join different route corners with horizontal or vertical segments.".into()),
    }
}

fn turn(from: Direction, to: Direction) -> Relative {
    [
        Relative::Forward,
        Relative::Right,
        Relative::Back,
        Relative::Left,
    ]
    .into_iter()
    .find(|relative| policy::face(from, *relative) == to)
    .expect("the four relative directions cover every heading")
}

fn corner(position: Point, incoming: Direction, outgoing: Direction) -> Rule {
    Rule {
        when: vec![
            Condition::AtPosition { position },
            Condition::Heading {
                direction: incoming,
            },
        ],
        action: Action::Turn {
            direction: turn(incoming, outgoing),
        },
        remember: None,
    }
}

/// Return a policy to apply with `world::Command::SetProgram`. The caller must
/// supply the same world when applying it. Four to eight actual corners form
/// a simple closed route; the carrier already stands on that route, and this
/// compiler includes an initial heading correction if one is needed.
/// Walls, closed edges, stationary cells and reserved construction targets are rejected.
pub fn compile(value: &world::World, cell: u16, waypoints: &[Point]) -> Result<Program, String> {
    if !(4..=8).contains(&waypoints.len()) {
        return Err("Draw a closed freight loop with 4–8 corners.".into());
    }
    if value.genesis.version < INDUSTRY_ACCOUNTING_VERSION {
        return Err("Freight routes need a new habitat-v6 world; this saved world keeps its original rules.".into());
    }
    let report = world::report(value)?;
    let definition = report
        .experiment
        .cells
        .iter()
        .find(|entry| entry.id == cell)
        .ok_or("Choose an original mobile carrier to assign a freight route.")?;
    if !definition.mobile {
        return Err("Stationary builders cannot follow a freight route.".into());
    }
    let actor = report
        .state
        .cells
        .iter()
        .find(|entry| entry.id == cell)
        .ok_or("The selected carrier is absent from this world.")?;
    let directions: Vec<_> = waypoints
        .iter()
        .enumerate()
        .map(|(index, point)| direction(*point, waypoints[(index + 1) % waypoints.len()]))
        .collect::<Result<_, _>>()?;
    let mut route = BTreeMap::new();
    for (index, start) in waypoints.iter().enumerate() {
        let incoming = directions[(index + directions.len() - 1) % directions.len()];
        let outgoing = directions[index];
        if matches!(turn(incoming, outgoing), Relative::Forward | Relative::Back) {
            return Err(
                "Each corner must turn left or right; remove straight or doubled-back points."
                    .into(),
            );
        }
        let end = waypoints[(index + 1) % waypoints.len()];
        let mut position = *start;
        while position != end {
            if position.x >= report.experiment.width
                || position.y >= report.experiment.height
                || report.experiment.walls.contains(&position)
            {
                return Err(format!(
                    "The route crosses a ridge or boundary at ({}, {}).",
                    position.x, position.y
                ));
            }
            if construction::reserved(&report.experiment, &report.state, position)
                || report.state.cells.iter().any(|other| {
                    other.position == position
                        && construction::cell_definition(
                            &report.experiment,
                            &report.state,
                            other.id,
                        )
                        .is_some_and(|definition| !definition.mobile)
                })
            {
                return Err(format!(
                    "The route crosses a stationary builder or reserved construction at ({}, {}).",
                    position.x, position.y
                ));
            }
            if route.insert(position, outgoing).is_some() {
                return Err("A freight loop cannot cross or retrace itself.".into());
            }
            let next = policy::destination(position, outgoing, Relative::Forward)
                .ok_or("The route leaves this region.")?;
            if report
                .state
                .closed_edges
                .contains(&Edge::new(position, next))
            {
                return Err(format!(
                    "The route crosses a closed passage at ({}, {}).",
                    position.x, position.y
                ));
            }
            position = next;
        }
    }
    let heading = *route
        .get(&actor.position)
        .ok_or("Include this carrier’s current tile in the freight loop.")?;
    let mut rules = world_fixtures::frontier_supply_rules();
    for (index, position) in waypoints.iter().enumerate() {
        rules.push(corner(
            *position,
            directions[(index + directions.len() - 1) % directions.len()],
            directions[index],
        ));
    }
    if actor.heading != heading {
        rules.push(corner(actor.position, actor.heading, heading));
    }
    rules.push(Rule {
        when: vec![Condition::Blocked {
            direction: Relative::Forward,
            value: false,
        }],
        action: Action::Move {
            direction: Relative::Forward,
        },
        remember: None,
    });
    rules.push(Rule {
        when: vec![],
        action: Action::Wait,
        remember: None,
    });
    let program = Program { rules };
    sim::validate_program(&report.experiment, &program)?;
    Ok(program)
}
