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
pub const PUBLISHED_CHALLENGES: u64 = 32;
pub const TRAIN_CASES: usize = 4;
pub const EVAL_CASES: usize = 4;
pub const EDITABLE_COURIER: u16 = 1;
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

fn stream(index: u64, stream_id: u64) -> u64 {
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

/// Difficulty band. Every eight indices raise the band, up to band four.
fn band(index: u64) -> u32 {
    1 + ((index - 1) / 8).min(3) as u32
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
    })
}

fn generate_case(
    index: u64,
    kind: u64,
    ordinal: u64,
    difficulty: u32,
    exclude: &[Experiment],
) -> Result<Experiment, String> {
    let mut rng = Rng(stream(index, kind).wrapping_add(ordinal.wrapping_mul(0x9e37_79b9)));
    for _ in 0..MAX_CASE_ATTEMPTS {
        let mut draw = Rng(rng.next());
        let Some(experiment) = draw_case(&mut draw, difficulty) else {
            continue;
        };
        if exclude.contains(&experiment) {
            continue;
        }
        let witnessed =
            fixtures::replace_program(&experiment, EDITABLE_COURIER, fixtures::resilient_courier());
        if crate::sim::run(&witnessed).is_ok_and(|result| result.outcome.passed) {
            return Ok(experiment);
        }
    }
    Err(format!(
        "Challenge generation found no feasible case for index {index}."
    ))
}

/// Derive one challenge. Pure and deterministic: the same index always yields
/// the same train/eval split under this generator version. Eval draws never
/// repeat a case already issued in the same bundle.
pub fn generate(index: u64) -> Result<Challenge, String> {
    if !(1..=9999).contains(&index) {
        return Err(format!("Unknown challenge index: {index}"));
    }
    let difficulty = band(index);
    let mut train: Vec<Experiment> = Vec::new();
    let mut eval = Vec::new();
    for ordinal in 0..TRAIN_CASES as u64 {
        train.push(generate_case(index, 1, ordinal, difficulty, &train)?);
    }
    for ordinal in 0..EVAL_CASES as u64 {
        let mut seen = train.clone();
        seen.extend(eval.iter().cloned());
        eval.push(generate_case(index, 2, ordinal, difficulty, &seen)?);
    }
    Ok(Challenge {
        schema: CHALLENGE_SCHEMA.into(),
        id: challenge_id(index),
        index,
        generator: GENERATOR_VERSION,
        family: "crossing".into(),
        band: difficulty,
        editable: vec![EDITABLE_COURIER],
        witness: "resilient_courier".into(),
        train,
        eval,
    })
}

pub fn by_id(id: &str) -> Result<Challenge, String> {
    generate(parse_id(id)?)
}

/// A named public baseline submission. Reference entries are honest anchors for
/// a board, not strong policies; their token counts are unknown, not zero.
pub fn reference_submission(challenge: &Challenge, policy: &str) -> Result<Submission, String> {
    let program = match policy {
        "resilient" => fixtures::resilient_courier(),
        "compact" => fixtures::compact_courier(),
        "idle" => fixtures::idle_program(),
        _ => {
            return Err(format!(
                "Unknown reference policy: {policy}. Known: resilient, compact, idle."
            ));
        }
    };
    Ok(Submission {
        schema: SUBMISSION_SCHEMA.into(),
        challenge: challenge.id.clone(),
        programs: BTreeMap::from([(EDITABLE_COURIER.to_string(), program)]),
        agent: Some(AgentReport {
            name: format!("reference:{policy}"),
            tokens: None,
            notes: Some("Public baseline; iterates on nothing.".into()),
        }),
    })
}

fn check_submission(challenge: &Challenge, submission: &Submission) -> Result<(), String> {
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

/// Rank verified results into per-challenge boards and a global rollup. An
/// entrant keeps their best result per challenge; only cleared challenges
/// count toward global work. Callers supply verified results; this orders them.
pub fn board(results: &[ChallengeResult]) -> Board {
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
    Board {
        schema: BOARD_SCHEMA.into(),
        generator: GENERATOR_VERSION,
        challenges: boards,
        global: rows,
    }
}
