//! Deterministically generated bounded challenges. Any index derives the same
//! public train/eval case split on every machine; admission requires a checked
//! witness run, so each published case has a known feasible policy. Reserved
//! eval cases score one submitted program across unfamiliar worlds.
use crate::check::{self, Receipt, artifact_hash};
use crate::fixtures;
use crate::model::*;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const CHALLENGE_SCHEMA: &str = "platonik-challenge-v1";
pub const SUBMISSION_SCHEMA: &str = "platonik-challenge-submission-v1";
pub const RESULT_SCHEMA: &str = "platonik-challenge-result-v1";
pub const BOARD_SCHEMA: &str = "platonik-challenge-board-v1";
pub const GENERATOR_VERSION: u32 = 1;
/// The currently published window. Higher indices still derive, but the
/// supported set grows only with a reviewed generator change.
pub const PUBLISHED_CHALLENGES: u64 = 96;
/// Indices 1..=32 are the crossing family forever: their derived bytes are
/// frozen by the committed artifacts. Switchboard begins at index 33 and
/// foundry at index 65.
const CROSSING_CHALLENGES: u64 = 32;
const SWITCHBOARD_CHALLENGES: u64 = 64;
pub const TRAIN_CASES: usize = 4;
pub const EVAL_CASES: usize = 4;
pub const EDITABLE_COURIER: u16 = 1;
pub const EDITABLE_KEEPER: u16 = 2;
pub const EDITABLE_BUILDER: u16 = 4;
const MAX_CASE_ATTEMPTS: u32 = 512;
const MAX_PLACEMENT_ATTEMPTS: u32 = 64;

/// SplitMix64: the same integer mixing family the simulator uses for seeded
/// activation order, kept dependency-free and stable across platforms.
struct Rng(u64);

impl Rng {
    fn next(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        z ^ (z >> 31)
    }
    fn below(&mut self, bound: u64) -> u64 {
        self.next() % bound
    }
    fn chance(&mut self, numerator: u64, denominator: u64) -> bool {
        self.below(denominator) < numerator
    }
}

pub(crate) fn stream(index: u64, stream_id: u64) -> u64 {
    let mut rng = Rng(index ^ (stream_id << 33) ^ ((GENERATOR_VERSION as u64) << 48));
    rng.next() ^ rng.next().rotate_left(31)
}

pub fn challenge_id(index: u64) -> String {
    format!("challenge-{index:04}")
}

pub fn parse_id(id: &str) -> Result<u64, String> {
    let index: u64 = id
        .strip_prefix("challenge-")
        .and_then(|rest| rest.parse().ok())
        .filter(|_| id.len() == "challenge-".len() + 4)
        .ok_or_else(|| format!("Unknown challenge id: {id}"))?;
    if !(1..=9999).contains(&index) {
        return Err(format!("Unknown challenge id: {id}"));
    }
    Ok(index)
}

pub fn names() -> Vec<String> {
    (1..=PUBLISHED_CHALLENGES).map(challenge_id).collect()
}

/// The family an index belongs to. Keyed by range, not by a version bump, so
/// the existing crossing stream keeps its exact bytes.
pub(crate) fn family(index: u64) -> &'static str {
    if index <= CROSSING_CHALLENGES {
        "crossing"
    } else if index <= SWITCHBOARD_CHALLENGES {
        "switchboard"
    } else {
        "foundry"
    }
}

/// The families inside the published window, in first-index order.
pub fn families() -> Vec<String> {
    let mut seen = Vec::new();
    for name in (1..=PUBLISHED_CHALLENGES).map(family) {
        if !seen.iter().any(|known| *known == name) {
            seen.push(name.to_string());
        }
    }
    seen
}

/// Difficulty band. Every eight indices raise the band, up to band four, and
/// each family restarts its ramp at band one on its first index.
pub(crate) fn band(index: u64) -> u32 {
    let offset = if index <= CROSSING_CHALLENGES {
        index.saturating_sub(1)
    } else if index <= SWITCHBOARD_CHALLENGES {
        index - CROSSING_CHALLENGES - 1
    } else {
        index - SWITCHBOARD_CHALLENGES - 1
    };
    1 + (offset / 8).min(3) as u32
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Challenge {
    pub schema: String,
    pub id: String,
    pub index: u64,
    pub generator: u32,
    pub family: String,
    pub band: u32,
    /// Cell ids whose programs a submission supplies; all other case fields are fixed.
    pub editable: Vec<u16>,
    /// The public policy used for admission; it is not part of a case.
    pub witness: String,
    pub train: Vec<Experiment>,
    /// Reserved scoring cases. Local bundles publish them for inspection;
    /// honest practice trains only on `train` (see docs/challenges.md).
    pub eval: Vec<Experiment>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AgentReport {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tokens: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Submission {
    pub schema: String,
    pub challenge: String,
    /// Map of editable cell id (as a string) to the submitted program.
    pub programs: BTreeMap<String, Program>,
    /// Self-reported entrant identity and effort; never authoritative.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<AgentReport>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CaseResult {
    pub id: String,
    pub experiment_hash: String,
    pub receipt_hash: String,
    pub passed: bool,
    pub status: RunStatus,
    pub work: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChallengeResult {
    pub schema: String,
    pub challenge: String,
    pub index: u64,
    pub generator: u32,
    pub passed: bool,
    pub cases_passed: u32,
    pub cases_total: u32,
    pub total_work: u64,
    pub program_bytes: u64,
    pub submission_hash: String,
    pub cases: Vec<CaseResult>,
    pub receipts: Vec<Receipt>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<AgentReport>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BoardRow {
    pub rank: u32,
    pub entrant: String,
    pub passed: bool,
    pub cases_passed: u32,
    pub cases_total: u32,
    pub total_work: u64,
    pub program_bytes: u64,
    pub submission_hash: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tokens: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChallengeBoard {
    pub challenge: String,
    pub index: u64,
    pub band: u32,
    pub rows: Vec<BoardRow>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GlobalRow {
    pub rank: u32,
    pub entrant: String,
    pub cleared: u32,
    pub attempted: u32,
    pub total_work: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tokens: Option<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Board {
    pub schema: String,
    pub generator: u32,
    pub challenges: Vec<ChallengeBoard>,
    pub global: Vec<GlobalRow>,
}

fn draw_case(rng: &mut Rng, band: u32) -> Option<Experiment> {
    let width = 7 + rng.below(4 + u64::from(band.min(2))) as u8;
    let height = 5 + rng.below(3) as u8;
    let density = 8 + u64::from(band) * 4 + rng.below(6);
    let mut walls = Vec::new();
    for y in 0..height {
        for x in 0..width {
            if rng.chance(density, 100) {
                walls.push(Point { x, y });
            }
        }
    }
    let free: Vec<Point> = (0..height)
        .flat_map(|y| (0..width).map(move |x| Point { x, y }))
        .filter(|point| !walls.contains(point))
        .collect();
    if free.len() < 4 {
        return None;
    }
    let minimum = ((u16::from(width) + u16::from(height)) / 3).max(4);
    let mut source = None;
    let mut beacon = None;
    for _ in 0..MAX_PLACEMENT_ATTEMPTS {
        let a = free[rng.below(free.len() as u64) as usize];
        let b = free[rng.below(free.len() as u64) as usize];
        if a != b && a.distance(b) >= minimum {
            source = Some(a);
            beacon = Some(b);
            break;
        }
    }
    let (source, beacon) = (source?, beacon?);
    let spark_count = 2 + rng.below(2 + u64::from(band.min(2))) as u32;
    let ticks = (56 + rng.below(33) + u64::from(band) * 8) as u32;
    let mut events = Vec::new();
    if band >= 2 && rng.chance(40 + u64::from(band) * 10, 100) {
        let usable = free.clone();
        'placement: for _ in 0..MAX_PLACEMENT_ATTEMPTS {
            let a = usable[rng.below(usable.len() as u64) as usize];
            for (dx, dy) in [(1i16, 0i16), (0i16, 1i16)] {
                let (bx, by) = (a.x as i16 + dx, a.y as i16 + dy);
                let b = Point {
                    x: u8::try_from(bx).unwrap_or(0),
                    y: u8::try_from(by).unwrap_or(0),
                };
                if bx >= 0
                    && by >= 0
                    && bx < width as i16
                    && by < height as i16
                    && usable.contains(&b)
                {
                    let tick = 12 + rng.below(u64::from(ticks - 24)) as u32;
                    events.push(Event {
                        tick,
                        event: EventKind::EdgeBlocked {
                            edge: Edge::new(a, b),
                            blocked: true,
                        },
                    });
                    break 'placement;
                }
            }
        }
    }
    let version = if events.is_empty() {
        MODEL_VERSION
    } else {
        HAZARD_VERSION
    };
    Some(Experiment {
        version,
        seed: rng.next(),
        width,
        height,
        walls,
        sources: vec![Source {
            id: 10,
            position: source,
            sparks: (1..=spark_count)
                .map(|id| Spark { id, bit: false })
                .collect(),
        }],
        depots: vec![],
        beacons: vec![Beacon {
            id: 20,
            position: beacon,
            accepts: false,
            initial_charge: 4 + rng.below(6) as u32,
            drain_every: 4 + rng.below(5) as u32,
            drain_amount: 1,
            spark_charge: 3 + rng.below(4) as u32,
            required_deliveries: spark_count,
        }],
        valves: vec![],
        cells: vec![Cell {
            id: EDITABLE_COURIER,
            position: source,
            heading: Direction::East,
            mobile: true,
            memory: [0; 4],
            program: fixtures::idle_program(),
        }],
        links: vec![],
        events,
        ticks,
        fuel: 24_000 + rng.below(24_000),
        activation_fuel: 128,
        construction: None,
        facilities: Vec::new(),
    })
}

/// Switchboard: a fixed porter shuttles sparks from the source to a
/// capacity-one depot, each drop reports the spark's bit on the depot's
/// links, a fixed relay forwards it, and the editable keeper routes the
/// depot's front spark through the valve to the matching zero/one beacon.
/// The capacity-one depot serializes arrivals so the newest report always
/// describes the front spark; the scored skill is conditional routing with
/// memory, not pathfinding.
fn draw_switchboard(rng: &mut Rng, band: u32) -> Option<Experiment> {
    let flip_x = rng.chance(1, 2);
    let flip_y = rng.chance(1, 2);
    // Corridor length: the porter walks 2..=5 cells from source to depot.
    let distance = (2 + rng.below(2 + u64::from(band.min(2)))) as u8;
    let height = (5 + rng.below(2)) as u8;
    let width = distance + 4 + rng.below(2) as u8;
    let corridor_y = (1 + rng.below(u64::from(height - 3))) as u8;
    let source = Point {
        x: 1,
        y: corridor_y,
    };
    let depot = Point {
        x: 1 + distance,
        y: corridor_y,
    };
    // The relay sits past the depot and doubles as the shuttle's bumper.
    let relay = Point {
        x: 2 + distance,
        y: corridor_y,
    };
    let valve = Point {
        x: 1 + distance,
        y: corridor_y + 1,
    };
    let keeper = Point {
        x: 2 + distance,
        y: corridor_y + 1,
    };
    // The valve's two free neighbors are the outlets; which side is zero is drawn.
    let west = Point {
        x: distance,
        y: corridor_y + 1,
    };
    let south = Point {
        x: 1 + distance,
        y: corridor_y + 2,
    };
    let (beacon_zero, beacon_one) = if rng.chance(1, 2) {
        (west, south)
    } else {
        (south, west)
    };
    let report_delay = (1 + rng.below(u64::from(band.min(4)))) as u32;
    let forward_delay = (1 + rng.below(u64::from(band.min(4)))) as u32;
    // Delivery schedule: the porter's round trip is 2d+4 ticks; a routed spark
    // frees the depot after report+forward+3. The slower side paces arrivals.
    let first_drop = u64::from(distance) + 2;
    let period =
        (2 * u64::from(distance) + 4).max(u64::from(report_delay) + u64::from(forward_delay) + 3);
    let mut count = 3 + band + rng.below(3) as u32;
    let mut last_delivery = first_drop
        + u64::from(count - 1) * period
        + u64::from(report_delay)
        + u64::from(forward_delay)
        + 2;
    // Keep slack for events and a tail margin under the 128-tick horizon.
    while last_delivery > 80 && count > 4 {
        count -= 1;
        last_delivery = first_drop
            + u64::from(count - 1) * period
            + u64::from(report_delay)
            + u64::from(forward_delay)
            + 2;
    }
    // Bit mix: at least one of each value, minority dealt evenly through the
    // drop order so no beacon starves behind a long run of the other value.
    let zeros = (1 + rng.below(u64::from(count - 1))) as u32;
    let ones = count - zeros;
    let (minor, minor_bit) = if zeros <= ones {
        (zeros, false)
    } else {
        (ones, true)
    };
    let mut bits = Vec::with_capacity(count as usize);
    let mut acc = (rng.below(u64::from(count))) as u32;
    for _ in 0..count {
        acc += minor;
        if acc >= count {
            bits.push(minor_bit);
            acc -= count;
        } else {
            bits.push(!minor_bit);
        }
    }
    // Longest delivery gap each outlet can face, in spark positions, counting
    // the run-up to a bit's first arrival as a gap too.
    let gap = |value: bool| -> u64 {
        let mut longest = 0u64;
        let mut seen = 0u64;
        for (index, bit) in bits.iter().enumerate() {
            if *bit == value {
                longest = longest.max(index as u64 - seen);
                seen = index as u64 + 1;
            }
        }
        longest
    };
    // Mid-run disturbances, all retry-safe for a patient keeper: one of the
    // redundant depot links can be cut, the valve can open late or flicker
    // shut, and the downstream link can flap. Nothing blocks the corridor.
    let mut events = Vec::new();
    let mut valve_starts_enabled = true;
    let mut stall = 0u64;
    if band >= 2 {
        let event_count = match band {
            2 => 1,
            3 => 1 + rng.below(2),
            _ => 2 + rng.below(2),
        };
        let mut kinds = [0u8, 1, 2, 3];
        let mut remaining = kinds.len();
        for _ in 0..event_count.min(remaining as u64) {
            let pick = rng.below(remaining as u64) as usize;
            remaining -= 1;
            kinds.swap(pick, remaining);
            match kinds[remaining] {
                0 => {
                    // Cut one redundant depot->relay report link for good.
                    let at = first_drop + 2 + rng.below((last_delivery - first_drop - 4).max(1));
                    events.push(Event {
                        tick: at as u32,
                        event: EventKind::LinkEnabled {
                            id: 40,
                            enabled: false,
                        },
                    });
                }
                1 => {
                    // The valve opens late; everything upstream just waits.
                    valve_starts_enabled = false;
                    let at = 2 + rng.below(4 + u64::from(band));
                    stall += at;
                    events.push(Event {
                        tick: at as u32,
                        event: EventKind::ValveEnabled {
                            id: fixtures::VALVE,
                            enabled: true,
                        },
                    });
                }
                2 => {
                    // The valve flickers shut for a few ticks mid-run.
                    let width = 1 + rng.below(2 + u64::from(band));
                    let span = (last_delivery - first_drop - period - width - 2).max(1);
                    let at = first_drop + period + rng.below(span);
                    stall += width;
                    events.push(Event {
                        tick: at as u32,
                        event: EventKind::ValveEnabled {
                            id: fixtures::VALVE,
                            enabled: false,
                        },
                    });
                    events.push(Event {
                        tick: (at + width) as u32,
                        event: EventKind::ValveEnabled {
                            id: fixtures::VALVE,
                            enabled: true,
                        },
                    });
                }
                _ => {
                    // The relay->keeper link drops briefly; resends cover it.
                    let width = 1 + rng.below(2 + u64::from(band));
                    let span = (last_delivery - first_drop - period - width - 2).max(1);
                    let at = first_drop + period + rng.below(span);
                    stall += width;
                    events.push(Event {
                        tick: at as u32,
                        event: EventKind::LinkEnabled {
                            id: 44,
                            enabled: false,
                        },
                    });
                    events.push(Event {
                        tick: (at + width) as u32,
                        event: EventKind::LinkEnabled {
                            id: 44,
                            enabled: true,
                        },
                    });
                }
            }
        }
    }
    events.sort_by_key(|event| event.tick);
    let ticks = last_delivery + stall + 12 + rng.below(6);
    if ticks > u64::from(MAX_TICKS - 2) {
        return None;
    }
    let ticks = ticks as u32;
    // Each beacon must see its quota of its own bit and stay charged: charge
    // covers the run-up plus the longest gap between that bit's deliveries,
    // so a late or stalled router still drains to zero.
    let drain_every = 4 + rng.below(4) as u32;
    let spark_charge = 3 + rng.below(4) as u32;
    let first_delivery = first_drop + u64::from(report_delay) + u64::from(forward_delay) + 2;
    let early_drains = first_delivery / u64::from(drain_every) + 1;
    let mut beacon = |id: u16, position: Point, accepts: bool, needed: u32| -> Beacon {
        let gap_drains = gap(!accepts) * period / u64::from(drain_every);
        Beacon {
            id,
            position,
            accepts,
            initial_charge: (early_drains + gap_drains + 3 + rng.below(3)) as u32,
            drain_every,
            drain_amount: 1,
            spark_charge,
            required_deliveries: needed,
        }
    };
    let beacons = vec![
        beacon(20, beacon_zero, false, zeros),
        beacon(21, beacon_one, true, ones),
    ];
    // Decorative walls only: never on the corridor or under the mechanism.
    let mut forbidden: Vec<Point> = (1..=2 + distance)
        .map(|x| Point { x, y: corridor_y })
        .collect();
    forbidden.extend([valve, keeper, beacon_zero, beacon_one]);
    let mut walls = Vec::new();
    for _ in 0..rng.below(3 + u64::from(band)) {
        for _ in 0..MAX_PLACEMENT_ATTEMPTS {
            let point = Point {
                x: rng.below(u64::from(width)) as u8,
                y: rng.below(u64::from(height)) as u8,
            };
            if !forbidden.contains(&point) && !walls.contains(&point) {
                walls.push(point);
                break;
            }
        }
    }
    let place = |point: Point| Point {
        x: if flip_x { width - 1 - point.x } else { point.x },
        y: if flip_y {
            height - 1 - point.y
        } else {
            point.y
        },
    };
    let walls = walls.iter().map(|point| place(*point)).collect();
    Some(Experiment {
        version: MODEL_VERSION,
        seed: rng.next(),
        width,
        height,
        walls,
        sources: vec![Source {
            id: 10,
            position: place(source),
            sparks: (1..=count)
                .map(|id| Spark {
                    id,
                    bit: bits[id as usize - 1],
                })
                .collect(),
        }],
        depots: vec![Depot {
            id: 11,
            position: place(depot),
            capacity: 1,
        }],
        beacons: beacons
            .into_iter()
            .map(|entry| Beacon {
                position: place(entry.position),
                ..entry
            })
            .collect(),
        valves: vec![Valve {
            id: fixtures::VALVE,
            position: place(valve),
            depot: 11,
            beacon_zero: 20,
            beacon_one: 21,
            enabled: valve_starts_enabled,
        }],
        cells: vec![
            Cell {
                id: 1,
                position: place(source),
                heading: if flip_x {
                    Direction::West
                } else {
                    Direction::East
                },
                mobile: true,
                memory: [0; 4],
                program: fixtures::switchboard_porter(),
            },
            Cell {
                id: EDITABLE_KEEPER,
                position: place(keeper),
                heading: Direction::East,
                mobile: false,
                memory: [0; 4],
                program: fixtures::idle_program(),
            },
            Cell {
                id: 3,
                position: place(relay),
                heading: Direction::East,
                mobile: false,
                memory: [0; 4],
                program: fixtures::switchboard_relay(),
            },
        ],
        links: vec![
            Link {
                id: 40,
                from: Endpoint::Depot { id: 11 },
                to_cell: 3,
                to_port: 0,
                delay: report_delay,
                enabled: true,
            },
            Link {
                id: 41,
                from: Endpoint::Depot { id: 11 },
                to_cell: 3,
                to_port: 0,
                delay: report_delay,
                enabled: true,
            },
            Link {
                id: 44,
                from: Endpoint::Cell { id: 3, port: 0 },
                to_cell: EDITABLE_KEEPER,
                to_port: 0,
                delay: forward_delay,
                enabled: true,
            },
        ],
        events,
        ticks,
        fuel: 20_000 + rng.below(20_000),
        activation_fuel: 128,
        construction: None,
        facilities: Vec::new(),
    })
}

/// Foundry: an immobile builder stands on a finite material stock between two
/// shuttle corridors only built children can serve. Each declared runner
/// blueprint assembles a courier that ferries its corridor's sparks from the
/// source to the beacon the builder cannot reach, so a passing program must
/// gather a unit, copy the body, then activate it — once per corridor — on a
/// stock that holds at most one spare unit. Higher bands add a decoy
/// blueprint beside the real runners and brief mid-run corridor closures;
/// born children carry fixed programs, so the scored skill is
/// resource-budgeted construction sequencing, not navigation or routing.
fn draw_foundry(rng: &mut Rng, band: u32) -> Option<Experiment> {
    let flip_x = rng.chance(1, 2);
    let flip_y = rng.chance(1, 2);
    let width = (8 + rng.below(2 + u64::from(band.min(2)))) as u8;
    let height: u8 = 5;
    // The builder stands on the stock in the middle row, adjacent to both
    // runner targets on the corridor rows above and below it.
    let builder = Point {
        x: (2 + rng.below(u64::from(width) - 4)) as u8,
        y: 2,
    };
    let source_a = Point { x: 0, y: 1 };
    let source_b = Point { x: 0, y: 3 };
    let beacon_a = Point { x: width - 1, y: 1 };
    let beacon_b = Point { x: width - 1, y: 3 };
    // Each runner body is a cell plus a report link back to the builder it was
    // born beside: the link wires one extra build tick into every assembly and
    // keeps the child's provenance legible once it is far from home.
    let runner = |blueprint: u16, child: u16, link: u16, target: Point| Blueprint {
        id: blueprint,
        body: BlueprintBody {
            cell: Cell {
                id: child,
                position: target,
                heading: Direction::West,
                mobile: true,
                memory: [0; 4],
                program: fixtures::switchboard_porter(),
            },
            links: vec![Link {
                id: link,
                from: Endpoint::Cell { id: child, port: 0 },
                to_cell: EDITABLE_BUILDER,
                to_port: 0,
                delay: 1,
                enabled: true,
            }],
        },
    };
    let runner_a = runner(
        fixtures::FOUNDRY_RUNNER_A,
        70,
        81,
        Point { x: builder.x, y: 1 },
    );
    let runner_b = runner(
        fixtures::FOUNDRY_RUNNER_B,
        71,
        82,
        Point { x: builder.x, y: 3 },
    );
    let copy_ticks = |blueprint: &Blueprint| -> u64 {
        crate::construction::payload(blueprint)
            .map(|bytes| (bytes.len() as u64).div_ceil(COPY_BYTES as u64))
            .unwrap_or(u64::MAX)
    };
    let build_ticks =
        |blueprint: &Blueprint| copy_ticks(blueprint) + blueprint.body.links.len() as u64;
    // Birth ticks are exact: one gather tick, the fixed copy-and-wire loop, one
    // activation tick, and the child first acts on the next tick.
    let birth_a = 2 + build_ticks(&runner_a);
    let birth_b = birth_a + 2 + build_ticks(&runner_b);
    // A runner walks `reach` tiles to its source, then cycles pickup ->
    // beacon drop -> back; each round trip is one corridor length each way.
    let reach = u64::from(builder.x);
    let interval = 2 * u64::from(width) + 2;
    let first_a = birth_a + reach + u64::from(width) + 2;
    let first_b = birth_b + reach + u64::from(width) + 2;
    let mut quota_a = 1 + rng.below(2 + u64::from(band)) as u32;
    let mut quota_b = 1 + rng.below(2 + u64::from(band)) as u32;
    // Keep slack for events and a tail margin under the 128-tick horizon:
    // trim the binding beacon's quota first, but never below one delivery —
    // both runners must be built for a case to pass.
    let mut last_a = first_a + u64::from(quota_a - 1) * interval;
    let mut last_b = first_b + u64::from(quota_b - 1) * interval;
    while last_a.max(last_b) + 18 > u64::from(MAX_TICKS) && quota_a + quota_b > 2 {
        if last_b >= last_a && quota_b > 1 {
            quota_b -= 1;
        } else if quota_a > 1 {
            quota_a -= 1;
        } else {
            quota_b -= 1;
        }
        last_a = first_a + u64::from(quota_a - 1) * interval;
        last_b = first_b + u64::from(quota_b - 1) * interval;
    }
    let last_delivery = last_a.max(last_b);
    // Mid-run disturbances, all retry-safe for a patient builder: a corridor
    // edge can close briefly — the shuttle bounces off and delivers late — or
    // a memory wipe can land on the builder, which a memoryless policy
    // ignores. Nothing blocks the gather-build-activate sequence itself.
    let mut events = Vec::new();
    let mut stall = 0u64;
    if band >= 2 {
        let event_count = match band {
            2 => 1,
            3 => 1 + rng.below(2),
            _ => 2 + rng.below(2),
        };
        for _ in 0..event_count {
            if rng.chance(1, 4) {
                let at = (2 + rng.below((last_delivery - 4).max(1))) as u32;
                events.push(Event {
                    tick: at,
                    event: EventKind::ClearMemory {
                        cell: EDITABLE_BUILDER,
                    },
                });
            } else {
                let row = if rng.chance(1, 2) { 1u8 } else { 3u8 };
                let x = rng.below(u64::from(width) - 1) as u8;
                let closed = 1 + rng.below(2 + u64::from(band));
                let span = (last_delivery - birth_a - 4).max(1);
                let at = (birth_a + 2 + rng.below(span)) as u32;
                stall += closed + interval;
                let edge = Edge::new(Point { x, y: row }, Point { x: x + 1, y: row });
                events.push(Event {
                    tick: at,
                    event: EventKind::EdgeBlocked {
                        edge,
                        blocked: true,
                    },
                });
                events.push(Event {
                    tick: at + closed as u32,
                    event: EventKind::EdgeBlocked {
                        edge,
                        blocked: false,
                    },
                });
            }
        }
    }
    events.sort_by_key(|event| event.tick);
    let ticks = last_delivery + stall + 10 + rng.below(6);
    if ticks > u64::from(MAX_TICKS - 2) {
        return None;
    }
    let ticks = ticks as u32;
    // Some cases declare a decoy blueprint beside the real runners: same
    // shuttle program, but its fixed target sits on the builder's own row
    // where no source or beacon can be reached — or it cannot move at all —
    // so building it only spends a material unit. Linked variants also cost
    // extra copy and wiring ticks.
    let decoy = if band >= 2 && rng.chance(2 + u64::from(band), 6) {
        let side = if rng.chance(1, 2) {
            builder.x - 1
        } else {
            builder.x + 1
        };
        let linked = rng.chance(1, 3);
        let mobile = rng.chance(1, 2);
        Some(Blueprint {
            id: 52,
            body: BlueprintBody {
                cell: Cell {
                    id: 72,
                    position: Point { x: side, y: 2 },
                    heading: Direction::West,
                    mobile,
                    memory: [0; 4],
                    program: fixtures::switchboard_porter(),
                },
                links: if linked {
                    vec![Link {
                        id: 80,
                        from: Endpoint::Cell { id: 72, port: 0 },
                        to_cell: EDITABLE_BUILDER,
                        to_port: 0,
                        delay: 1,
                        enabled: true,
                    }]
                } else {
                    Vec::new()
                },
            },
        })
    } else {
        None
    };
    // The stock holds exactly the needed units plus at most one spare, so a
    // unit spent on the decoy can be the difference between passing and not.
    let units = (0..2 + rng.below(2) as u32)
        .map(|unit| 900 + unit)
        .collect();
    // Each beacon must see its quota and stay charged: charge covers the
    // run-up to its first delivery plus the gap each later delivery must
    // bridge, and every delivered spark's energy carries the tail.
    let drain_every = 4 + rng.below(4) as u32;
    let spark_charge = 3 + rng.below(4) as u32;
    let charge = |first: u64, quota: u32, rng: &mut Rng| -> u32 {
        let d = u64::from(drain_every);
        let c = u64::from(spark_charge);
        let mut need = (u64::from(ticks) / d + 1).saturating_sub(u64::from(quota) * c);
        for k in 0..u64::from(quota) {
            let at = first + k * interval;
            need = need.max(((at - 1) / d + 1).saturating_sub(k * c));
        }
        (need + 4 + rng.below(4) + stall / d) as u32
    };
    let bit_a = rng.chance(1, 2);
    let bit_b = rng.chance(1, 2);
    let charge_a = charge(first_a, quota_a, rng);
    let charge_b = charge(first_b, quota_b, rng);
    // Decorative walls only: never on a corridor row or the builder's row.
    let mut walls = Vec::new();
    for _ in 0..rng.below(3 + u64::from(band)) {
        let point = Point {
            x: rng.below(u64::from(width)) as u8,
            y: if rng.chance(1, 2) { 0 } else { height - 1 },
        };
        if !walls.contains(&point) {
            walls.push(point);
        }
    }
    let place = |point: Point| Point {
        x: if flip_x { width - 1 - point.x } else { point.x },
        y: if flip_y {
            height - 1 - point.y
        } else {
            point.y
        },
    };
    // Runners launch toward their source; the shuttle program only needs a
    // heading to start its first leg on.
    let heading = if flip_x {
        Direction::East
    } else {
        Direction::West
    };
    let born = |blueprint: Blueprint| -> Blueprint {
        let mut blueprint = blueprint;
        blueprint.body.cell.position = place(blueprint.body.cell.position);
        blueprint.body.cell.heading = heading;
        blueprint
    };
    let mut blueprints = vec![born(runner_a), born(runner_b)];
    if let Some(decoy) = decoy {
        blueprints.push(born(decoy));
    }
    let events = events
        .into_iter()
        .map(|mut event| {
            if let EventKind::EdgeBlocked { edge, .. } = &mut event.event {
                *edge = Edge::new(place(edge.a), place(edge.b));
            }
            event
        })
        .collect();
    Some(Experiment {
        version: CONSTRUCTION_VERSION,
        seed: rng.next(),
        width,
        height,
        walls: walls.iter().map(|point| place(*point)).collect(),
        sources: vec![
            Source {
                id: 10,
                position: place(source_a),
                sparks: (1..=quota_a).map(|id| Spark { id, bit: bit_a }).collect(),
            },
            Source {
                id: 11,
                position: place(source_b),
                sparks: (quota_a + 1..=quota_a + quota_b)
                    .map(|id| Spark { id, bit: bit_b })
                    .collect(),
            },
        ],
        depots: vec![],
        beacons: vec![
            Beacon {
                id: 20,
                position: place(beacon_a),
                accepts: bit_a,
                initial_charge: charge_a,
                drain_every,
                drain_amount: 1,
                spark_charge,
                required_deliveries: quota_a,
            },
            Beacon {
                id: 21,
                position: place(beacon_b),
                accepts: bit_b,
                initial_charge: charge_b,
                drain_every,
                drain_amount: 1,
                spark_charge,
                required_deliveries: quota_b,
            },
        ],
        valves: vec![],
        cells: vec![Cell {
            id: EDITABLE_BUILDER,
            position: place(builder),
            heading: Direction::East,
            mobile: false,
            memory: [0; 4],
            program: fixtures::idle_program(),
        }],
        links: vec![],
        events,
        ticks,
        fuel: 30_000 + rng.below(30_000),
        activation_fuel: 128,
        construction: Some(ConstructionSpec {
            stocks: vec![MaterialStock {
                id: fixtures::FOUNDRY_STOCK,
                position: place(builder),
                units,
            }],
            blueprints,
        }),
        facilities: Vec::new(),
    })
}

/// Draw one witnessed case from a derivation root. Public generation passes
/// `stream(index, kind)` as the root; hosted seasons pass a salted root so the
/// same case engine serves both paths. The draw function, editable cell, and
/// witness program are the family's contract: a case is admitted only when
/// the witness passes it under the published limits.
fn witnessed_case(
    draw: fn(&mut Rng, u32) -> Option<Experiment>,
    editable: u16,
    witness: &Program,
    root: u64,
    ordinal: u64,
    difficulty: u32,
    exclude: &[Experiment],
) -> Result<Experiment, String> {
    let mut rng = Rng(root.wrapping_add(ordinal.wrapping_mul(0x9e37_79b9)));
    for _ in 0..MAX_CASE_ATTEMPTS {
        let mut drawn = Rng(rng.next());
        let Some(experiment) = draw(&mut drawn, difficulty) else {
            continue;
        };
        if exclude.contains(&experiment) {
            continue;
        }
        let witnessed = fixtures::replace_program(&experiment, editable, witness.clone());
        if crate::sim::run(&witnessed).is_ok_and(|result| result.outcome.passed) {
            return Ok(experiment);
        }
    }
    Err(format!(
        "Challenge generation found no feasible case for derivation root {root}."
    ))
}

/// One family's case-generation contract: which cell entrants edit, the
/// public witness that admits cases, and the draw that builds a world.
struct FamilySpec {
    family: &'static str,
    editable: u16,
    witness_name: &'static str,
    witness: Program,
    draw: fn(&mut Rng, u32) -> Option<Experiment>,
}

fn spec_for(family: &str) -> FamilySpec {
    match family {
        "switchboard" => FamilySpec {
            family: "switchboard",
            editable: EDITABLE_KEEPER,
            witness_name: "switchboard_keeper",
            witness: fixtures::switchboard_keeper(),
            draw: draw_switchboard,
        },
        "foundry" => FamilySpec {
            family: "foundry",
            editable: EDITABLE_BUILDER,
            witness_name: "foundry_builder",
            witness: fixtures::foundry_builder(),
            draw: draw_foundry,
        },
        _ => FamilySpec {
            family: "crossing",
            editable: EDITABLE_COURIER,
            witness_name: "resilient_courier",
            witness: fixtures::resilient_courier(),
            draw: draw_case,
        },
    }
}

/// Derive one case under the index's own family contract — the same draw,
/// editable cell, and witness the public bundle uses — for the hosted
/// season's salted path. A season manifest may name any published index and
/// stay coherent.
pub(crate) fn derive_case(
    index: u64,
    root: u64,
    ordinal: u64,
    exclude: &[Experiment],
) -> Result<Experiment, String> {
    let spec = spec_for(family(index));
    witnessed_case(
        spec.draw,
        spec.editable,
        &spec.witness,
        root,
        ordinal,
        band(index),
        exclude,
    )
}

/// Derive one challenge. Pure and deterministic: the same index always yields
/// the same train/eval split under this generator version. Eval draws never
/// repeat a case already issued in the same bundle.
pub fn generate(index: u64) -> Result<Challenge, String> {
    if !(1..=9999).contains(&index) {
        return Err(format!("Unknown challenge index: {index}"));
    }
    let spec = spec_for(family(index));
    let difficulty = band(index);
    let mut train: Vec<Experiment> = Vec::new();
    let mut eval = Vec::new();
    for ordinal in 0..TRAIN_CASES as u64 {
        train.push(witnessed_case(
            spec.draw,
            spec.editable,
            &spec.witness,
            stream(index, 1),
            ordinal,
            difficulty,
            &train,
        )?);
    }
    for ordinal in 0..EVAL_CASES as u64 {
        let mut seen = train.clone();
        seen.extend(eval.iter().cloned());
        eval.push(witnessed_case(
            spec.draw,
            spec.editable,
            &spec.witness,
            stream(index, 2),
            ordinal,
            difficulty,
            &seen,
        )?);
    }
    Ok(Challenge {
        schema: CHALLENGE_SCHEMA.into(),
        id: challenge_id(index),
        index,
        generator: GENERATOR_VERSION,
        family: spec.family.into(),
        band: difficulty,
        editable: vec![spec.editable],
        witness: spec.witness_name.into(),
        train,
        eval,
    })
}

pub fn by_id(id: &str) -> Result<Challenge, String> {
    generate(parse_id(id)?)
}

/// The reference policies a family admits, in board order. `idle` is the
/// shared honest floor; `resilient` on switchboard or foundry grafts the
/// crossing witness into a cell it cannot drive, where it runs and fails on
/// its own merits — a control showing the skills do not transfer.
fn family_policies(family: &str) -> &'static [&'static str] {
    match family {
        "switchboard" => &["keeper", "resilient", "idle"],
        "foundry" => &["builder", "resilient", "idle"],
        _ => &["resilient", "compact", "idle"],
    }
}

/// A named public baseline submission. Reference entries are honest anchors for
/// a board, not strong policies; their token counts are unknown, not zero.
/// Policies are family-scoped: asking for one outside its family is an error,
/// never a silent substitution.
pub fn reference_submission(challenge: &Challenge, policy: &str) -> Result<Submission, String> {
    let program = match (challenge.family.as_str(), policy) {
        (_, "idle") => fixtures::idle_program(),
        ("crossing", "resilient") => fixtures::resilient_courier(),
        ("crossing", "compact") => fixtures::compact_courier(),
        ("switchboard", "keeper") => fixtures::switchboard_keeper(),
        ("switchboard", "resilient") => fixtures::resilient_courier(),
        ("foundry", "builder") => fixtures::foundry_builder(),
        ("foundry", "resilient") => fixtures::resilient_courier(),
        _ => {
            return Err(format!(
                "Unknown reference policy for family {}: {policy}. Known: {}.",
                challenge.family,
                family_policies(&challenge.family).join(", ")
            ));
        }
    };
    Ok(Submission {
        schema: SUBMISSION_SCHEMA.into(),
        challenge: challenge.id.clone(),
        programs: challenge
            .editable
            .iter()
            .map(|id| (id.to_string(), program.clone()))
            .collect(),
        agent: Some(AgentReport {
            name: format!("reference:{policy}"),
            tokens: None,
            notes: Some("Public baseline; iterates on nothing.".into()),
        }),
    })
}

pub(crate) fn check_submission(
    challenge: &Challenge,
    submission: &Submission,
) -> Result<(), String> {
    if submission.schema != SUBMISSION_SCHEMA {
        return Err("Submission schema must be platonik-challenge-submission-v1.".into());
    }
    if submission.challenge != challenge.id {
        return Err(format!(
            "Submission targets {} but {} was requested.",
            submission.challenge, challenge.id
        ));
    }
    let mut expected: Vec<String> = challenge.editable.iter().map(u16::to_string).collect();
    expected.sort();
    let provided: Vec<String> = submission.programs.keys().cloned().collect();
    if provided != expected {
        return Err(format!(
            "Submission must supply exactly the editable cells: {}.",
            expected.join(", ")
        ));
    }
    Ok(())
}

fn graft(experiment: &Experiment, submission: &Submission) -> Experiment {
    let mut copy = experiment.clone();
    for cell in &mut copy.cells {
        if let Some(program) = submission.programs.get(&cell.id.to_string()) {
            cell.program = program.clone();
        }
    }
    copy
}

/// Score one submitted program set across the reserved eval cases. Every case
/// runs under its published limits; a failed case keeps its honest receipt.
pub fn evaluate(challenge: &Challenge, submission: &Submission) -> Result<ChallengeResult, String> {
    check_submission(challenge, submission)?;
    if challenge.eval.is_empty() {
        return Err("Challenge has no eval cases to score.".into());
    }
    let mut cases = Vec::new();
    let mut receipts = Vec::new();
    for (ordinal, case) in challenge.eval.iter().enumerate() {
        let grafted = graft(case, submission);
        let receipt = check::make_receipt(&grafted)
            .map_err(|error| format!("eval case {}: {error}", ordinal + 1))?;
        cases.push(CaseResult {
            id: format!("eval-{}", ordinal + 1),
            experiment_hash: receipt.experiment_hash.clone(),
            receipt_hash: receipt.result_hash.clone(),
            passed: receipt.passed(),
            status: receipt.result.status,
            work: receipt.result.costs.total(),
        });
        receipts.push(receipt);
    }
    let cases_passed = cases.iter().filter(|case| case.passed).count() as u32;
    Ok(ChallengeResult {
        schema: RESULT_SCHEMA.into(),
        challenge: challenge.id.clone(),
        index: challenge.index,
        generator: challenge.generator,
        passed: cases_passed as usize == cases.len(),
        cases_passed,
        cases_total: cases.len() as u32,
        total_work: cases.iter().map(|case| case.work).sum(),
        program_bytes: serde_json::to_vec(&submission.programs)
            .map_err(|error| error.to_string())?
            .len() as u64,
        submission_hash: artifact_hash(&submission.programs)?,
        cases,
        receipts,
        agent: submission.agent.clone(),
    })
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResultVerification {
    pub schema: String,
    pub verified: bool,
    pub challenge: String,
    pub passed: bool,
    pub cases_passed: u32,
    pub total_work: u64,
    pub submission_hash: String,
}

/// Recompute a challenge result from the deterministic generator and the
/// embedded submission evidence. Re-execution is the check.
pub fn verify_result(result: &ChallengeResult) -> Result<ResultVerification, String> {
    if result.schema != RESULT_SCHEMA {
        return Err("Result schema must be platonik-challenge-result-v1.".into());
    }
    verify_against(&generate(result.index)?, result)
}

/// Recompute a result against an already-generated challenge. Board batches
/// share one generation per index; standalone callers use `verify_result`.
pub fn verify_against(
    challenge: &Challenge,
    result: &ChallengeResult,
) -> Result<ResultVerification, String> {
    if result.schema != RESULT_SCHEMA {
        return Err("Result schema must be platonik-challenge-result-v1.".into());
    }
    if result.generator != GENERATOR_VERSION {
        return Err(format!(
            "Result generator {} does not match {GENERATOR_VERSION}.",
            result.generator
        ));
    }
    if challenge.index != result.index || challenge.id != result.challenge {
        return Err("Result challenge id does not match its index.".into());
    }
    let first = result
        .receipts
        .first()
        .ok_or("Result carries no receipts.")?;
    let mut submission = Submission {
        schema: SUBMISSION_SCHEMA.into(),
        challenge: result.challenge.clone(),
        programs: BTreeMap::new(),
        agent: result.agent.clone(),
    };
    for id in &challenge.editable {
        let cell = first
            .experiment
            .cells
            .iter()
            .find(|cell| cell.id == *id)
            .ok_or("Result receipts do not cover the editable cells.")?;
        submission
            .programs
            .insert(id.to_string(), cell.program.clone());
    }
    let recomputed = evaluate(challenge, &submission)?;
    if recomputed.cases != result.cases
        || recomputed.receipts != result.receipts
        || recomputed.total_work != result.total_work
        || recomputed.program_bytes != result.program_bytes
        || recomputed.submission_hash != result.submission_hash
        || recomputed.passed != result.passed
        || recomputed.cases_passed != result.cases_passed
        || recomputed.cases_total != result.cases_total
    {
        return Err("Result does not recompute from the generator.".into());
    }
    Ok(ResultVerification {
        schema: "platonik-challenge-verify-v1".into(),
        verified: true,
        challenge: result.challenge.clone(),
        passed: result.passed,
        cases_passed: result.cases_passed,
        total_work: result.total_work,
        submission_hash: result.submission_hash.clone(),
    })
}

fn entrant(result: &ChallengeResult) -> String {
    result
        .agent
        .as_ref()
        .map(|agent| agent.name.clone())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| {
            let hash = result
                .submission_hash
                .strip_prefix("sha256:")
                .unwrap_or(&result.submission_hash);
            format!("anon-{}", hash.get(..8).unwrap_or(hash))
        })
}

fn order(a: &ChallengeResult, b: &ChallengeResult) -> std::cmp::Ordering {
    b.passed
        .cmp(&a.passed)
        .then(b.cases_passed.cmp(&a.cases_passed))
        .then(a.total_work.cmp(&b.total_work))
        .then(a.program_bytes.cmp(&b.program_bytes))
        .then(a.submission_hash.cmp(&b.submission_hash))
}

/// Shared ranking core: per-challenge boards and a global rollup, in the same
/// order the public board publishes. Callers verify results first; this orders
/// them. Season boards reuse it so hosted rankings match public ones.
pub(crate) fn rank_results(results: &[ChallengeResult]) -> (Vec<ChallengeBoard>, Vec<GlobalRow>) {
    let mut challenges: BTreeMap<String, Vec<&ChallengeResult>> = BTreeMap::new();
    for result in results {
        challenges
            .entry(result.challenge.clone())
            .or_default()
            .push(result);
    }
    let mut boards = Vec::new();
    let mut global: BTreeMap<String, (u32, u32, u64, Option<u64>)> = BTreeMap::new();
    for (challenge, mut entries) in challenges {
        entries.sort_by(|a, b| order(a, b));
        let index = entries[0].index;
        let mut rows = Vec::new();
        let mut seen = BTreeSet::new();
        for result in entries {
            let name = entrant(result);
            if !seen.insert(name.clone()) {
                continue;
            }
            rows.push(BoardRow {
                rank: rows.len() as u32 + 1,
                entrant: name.clone(),
                passed: result.passed,
                cases_passed: result.cases_passed,
                cases_total: result.cases_total,
                total_work: result.total_work,
                program_bytes: result.program_bytes,
                submission_hash: result.submission_hash.clone(),
                tokens: result.agent.as_ref().and_then(|agent| agent.tokens),
            });
            let entry = global.entry(name).or_insert((0, 0, 0, None));
            entry.1 = entry.1.saturating_add(1);
            if result.passed {
                entry.0 = entry.0.saturating_add(1);
                entry.2 = entry.2.saturating_add(result.total_work);
            }
            if let Some(tokens) = result.agent.as_ref().and_then(|agent| agent.tokens) {
                entry.3 = Some(entry.3.unwrap_or(0).saturating_add(tokens));
            }
        }
        boards.push(ChallengeBoard {
            challenge,
            index,
            band: band(index),
            rows,
        });
    }
    let mut rows: Vec<GlobalRow> = global
        .into_iter()
        .map(|(name, (cleared, attempted, work, tokens))| GlobalRow {
            rank: 0,
            entrant: name,
            cleared,
            attempted,
            total_work: work,
            tokens,
        })
        .collect();
    rows.sort_by(|a, b| {
        b.cleared
            .cmp(&a.cleared)
            .then(a.total_work.cmp(&b.total_work))
            .then(a.entrant.cmp(&b.entrant))
    });
    for (index, row) in rows.iter_mut().enumerate() {
        row.rank = index as u32 + 1;
    }
    (boards, rows)
}

/// Rank verified results into per-challenge boards and a global rollup. An
/// entrant keeps their best result per challenge; only cleared challenges
/// count toward global work. Callers supply verified results; this orders them.
pub fn board(results: &[ChallengeResult]) -> Board {
    let (challenges, global) = rank_results(results);
    Board {
        schema: BOARD_SCHEMA.into(),
        generator: GENERATOR_VERSION,
        challenges,
        global,
    }
}
