//! Hosted seasonal evaluation. A season commits to a hidden salt up front, so
//! each entrant's reserved eval split can be derived later from
//! (salt, entrant, challenge index, entry ordinal): the operator scores entries
//! against cases no entrant could precompute, then reveals the salt that proves
//! the derivation. Before reveal, a season result still verifies on standalone
//! receipt replay and internal arithmetic; after reveal it recomputes fully.
use crate::challenge::{
    self, CHALLENGE_SCHEMA, Challenge, ChallengeBoard, ChallengeResult, EVAL_CASES,
    GENERATOR_VERSION, GlobalRow, RESULT_SCHEMA, Submission,
};
use crate::check::{self, artifact_hash};
use crate::model::Experiment;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;

pub const SEASON_SCHEMA: &str = "platonik-challenge-season-v1";
pub const SEASON_RESULT_SCHEMA: &str = "platonik-season-result-v1";
pub const SEASON_VERIFY_SCHEMA: &str = "platonik-season-verify-v1";
pub const SEASON_SALT_SCHEMA: &str = "platonik-season-salt-v1";
pub const SEASON_BOARD_SCHEMA: &str = "platonik-season-board-v1";
pub const ADMISSION_SCHEMA: &str = "platonik-season-admission-v1";
pub const SEASON_VERSION: u32 = 1;
pub const SALT_BYTES: usize = 32;
pub const MAX_SEASON_CHALLENGES: usize = 256;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Season {
    pub schema: String,
    pub id: String,
    pub version: u32,
    /// The challenge generator this season's cases derive under.
    pub generator: u32,
    /// `artifact_hash` of the canonical salt record; the salt stays hidden
    /// until `reveal`.
    pub commitment: String,
    /// Challenge indices in the window, sorted and unique.
    pub challenges: Vec<u64>,
    /// Per-entrant entry quota.
    pub max_entries: u32,
    /// "open" while admitting and scoring, "closed" once the operator stops
    /// intake, "revealed" once the salt is attached.
    pub status: String,
    /// The revealed salt as 64 lowercase hex characters; absent before reveal.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub salt: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SeasonResult {
    pub schema: String,
    pub season: String,
    pub commitment: String,
    /// Canonical entrant identity, e.g. "github:login".
    pub entrant: String,
    /// 1-based ordinal the evaluator assigned at admission.
    pub entry: u32,
    /// The scored run; keeps the challenge result schema.
    pub result: ChallengeResult,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Admission {
    pub schema: String,
    pub admitted: bool,
    /// The assigned 1-based entry ordinal; 0 when refused.
    pub entry: u32,
    pub reason: String,
    pub submission_hash: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SeasonVerification {
    pub schema: String,
    pub verified: bool,
    pub season: String,
    pub entrant: String,
    pub entry: u32,
    pub passed: bool,
    pub cases_passed: u32,
    pub total_work: u64,
    pub submission_hash: String,
    /// "revealed" when the derived split was recomputed from the salt,
    /// "withheld" when only receipts and arithmetic were replayed.
    pub derivation: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SeasonBoard {
    pub schema: String,
    pub season: String,
    pub commitment: String,
    pub challenges: Vec<ChallengeBoard>,
    pub global: Vec<GlobalRow>,
}

/// The canonical record a season commitment hashes. Field order is fixed, so
/// the commitment identifies exactly this triple.
#[derive(Serialize)]
struct SaltRecord {
    schema: String,
    season: String,
    salt: String,
}

pub fn season_id(index: u64) -> String {
    format!("season-{index:04}")
}

/// Strict id parse: "season-" plus four digits in 1..=9999, like
/// `challenge::parse_id`.
pub fn parse_season_id(id: &str) -> Result<u64, String> {
    let index: u64 = id
        .strip_prefix("season-")
        .and_then(|rest| rest.parse().ok())
        .filter(|_| id.len() == "season-".len() + 4)
        .ok_or_else(|| format!("Unknown season id: {id}"))?;
    if !(1..=9999).contains(&index) {
        return Err(format!("Unknown season id: {id}"));
    }
    Ok(index)
}

/// Parse a challenge window like `"1-8,12"` into indices. `begin` sorts and
/// dedups the stored window.
pub fn parse_challenge_list(text: &str) -> Result<Vec<u64>, String> {
    let mut indices = Vec::new();
    for part in text.split(',') {
        let part = part.trim();
        let (start, end) = match part.split_once('-') {
            Some((lo, hi)) => (lo.trim(), hi.trim()),
            None => (part, part),
        };
        let parse = |value: &str| {
            value
                .parse::<u64>()
                .ok()
                .filter(|index| (1..=9999).contains(index))
                .ok_or_else(|| format!("Challenge index out of range: {value}"))
        };
        let (lo, hi) = (parse(start)?, parse(end)?);
        if lo > hi {
            return Err(format!("Challenge range {part} is descending."));
        }
        if hi - lo >= MAX_SEASON_CHALLENGES as u64 {
            return Err(format!(
                "Challenge range {part} exceeds the season window cap."
            ));
        }
        indices.extend(lo..=hi);
    }
    Ok(indices)
}

/// Parse a revealed salt: 64 hexadecimal characters, either case, optionally
/// surrounded by whitespace.
pub fn parse_salt_hex(text: &str) -> Result<Vec<u8>, String> {
    let trimmed = text.trim();
    if trimmed.len() != SALT_BYTES * 2 || !trimmed.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("Season salt must be 64 hexadecimal characters.".into());
    }
    (0..SALT_BYTES)
        .map(|index| {
            u8::from_str_radix(&trimmed[index * 2..index * 2 + 2], 16)
                .map_err(|error| error.to_string())
        })
        .collect()
}

fn hex_of(bytes: &[u8]) -> String {
    use std::fmt::Write;
    bytes
        .iter()
        .fold(String::with_capacity(bytes.len() * 2), |mut out, byte| {
            let _ = write!(out, "{byte:02x}");
            out
        })
}

/// Derivation root for one entry's eval split: a domain-separated hash of the
/// salt, canonical entrant, challenge index, and 1-based entry ordinal. The
/// tuple encoding keeps fields unambiguous.
fn season_root(salt: &[u8], entrant: &str, index: u64, entry: u32) -> u64 {
    let preimage = serde_json::to_vec(&("platonik-season-v1", hex_of(salt), entrant, index, entry))
        .expect("a fixed tuple of primitives always serializes");
    let digest = Sha256::digest(&preimage);
    u64::from_le_bytes(digest[..8].try_into().expect("sha256 digests 32 bytes"))
}

/// Commitment over the canonical salt record. A wrong index or salt length
/// fails here rather than publishing a meaningless commitment.
pub fn salt_commitment(season_index: u64, salt: &[u8]) -> Result<String, String> {
    if !(1..=9999).contains(&season_index) {
        return Err(format!("Unknown season index: {season_index}"));
    }
    if salt.len() != SALT_BYTES {
        return Err(format!("Season salt must be {SALT_BYTES} bytes."));
    }
    artifact_hash(&SaltRecord {
        schema: SEASON_SALT_SCHEMA.into(),
        season: season_id(season_index),
        salt: hex_of(salt),
    })
}

/// Check a season record's fixed fields and return its index. The commitment
/// itself covers only the salt record; this guards the rest of the envelope.
fn season_index(season: &Season) -> Result<u64, String> {
    if season.schema != SEASON_SCHEMA {
        return Err("Season schema must be platonik-challenge-season-v1.".into());
    }
    if season.version != SEASON_VERSION {
        return Err(format!(
            "Season version {} does not match {SEASON_VERSION}.",
            season.version
        ));
    }
    if season.generator != GENERATOR_VERSION {
        return Err(format!(
            "Season generator {} does not match {GENERATOR_VERSION}.",
            season.generator
        ));
    }
    if !matches!(season.status.as_str(), "open" | "closed" | "revealed") {
        return Err(format!("Unknown season status: {}", season.status));
    }
    let valid_commitment = season
        .commitment
        .strip_prefix("sha256:")
        .is_some_and(|hex| hex.len() == 64 && hex.bytes().all(|byte| byte.is_ascii_hexdigit()));
    if !valid_commitment {
        return Err("Season commitment must be sha256:<64 hex>.".into());
    }
    if season.salt.is_some() != (season.status == "revealed") {
        return Err("A season carries its salt exactly when revealed.".into());
    }
    parse_season_id(&season.id)
}

/// Open a season: commit to `salt`, publish the deduplicated challenge window,
/// and cap the per-entrant entry count. Every window member must still derive
/// a witnessed public bundle under this generator.
pub fn begin(
    index: u64,
    challenges: Vec<u64>,
    max_entries: u32,
    salt: &[u8],
) -> Result<Season, String> {
    if !(1..=9999).contains(&index) {
        return Err(format!("Unknown season index: {index}"));
    }
    if salt.len() != SALT_BYTES {
        return Err(format!("Season salt must be {SALT_BYTES} bytes."));
    }
    if challenges.is_empty() {
        return Err("A season needs at least one challenge.".into());
    }
    let mut window = challenges;
    window.sort_unstable();
    window.dedup();
    if window.len() > MAX_SEASON_CHALLENGES {
        return Err(format!(
            "A season admits at most {MAX_SEASON_CHALLENGES} challenges."
        ));
    }
    for &challenge in &window {
        // Generation is the admission check: every member must derive a
        // witnessed public bundle under this generator.
        challenge::generate(challenge)?;
    }
    if !(1..=256).contains(&max_entries) {
        return Err("Season max_entries must be in 1..=256.".into());
    }
    Ok(Season {
        schema: SEASON_SCHEMA.into(),
        id: season_id(index),
        version: SEASON_VERSION,
        generator: GENERATOR_VERSION,
        commitment: salt_commitment(index, salt)?,
        challenges: window,
        max_entries,
        status: "open".into(),
        salt: None,
    })
}

/// Attach the salt once it satisfies the commitment. Only the commitment gates
/// this transition; the operator moves a season to "closed" by editing the
/// record, and closing does not gate reveal.
pub fn reveal(season: &Season, salt: &[u8]) -> Result<Season, String> {
    if salt_commitment(season_index(season)?, salt)? != season.commitment {
        return Err("Salt does not match the season commitment.".into());
    }
    let mut revealed = season.clone();
    revealed.status = "revealed".into();
    revealed.salt = Some(hex_of(salt));
    Ok(revealed)
}

/// Derive one entrant's challenge bundle: the public train split plus a
/// reserved eval split keyed by (salt, entrant, entry). The same arguments
/// always derive the same bundle, and the salt must satisfy the commitment.
pub fn season_challenge(
    season: &Season,
    salt: &[u8],
    entrant: &str,
    entry: u32,
    index: u64,
) -> Result<Challenge, String> {
    if salt_commitment(season_index(season)?, salt)? != season.commitment {
        return Err("Salt does not match the season commitment.".into());
    }
    if !season.challenges.contains(&index) {
        return Err(format!(
            "Challenge index {index} is not in the season window."
        ));
    }
    let entrant = entrant.trim();
    if entrant.is_empty() {
        return Err("Season derivation needs a named entrant.".into());
    }
    if entry == 0 {
        return Err("Season entry ordinals are 1-based.".into());
    }
    let public = challenge::generate(index)?;
    let difficulty = challenge::band(index);
    let root = season_root(salt, entrant, index, entry);
    let mut seen: Vec<Experiment> = Vec::new();
    let mut eval = Vec::with_capacity(EVAL_CASES);
    for ordinal in 0..EVAL_CASES as u64 {
        let case = challenge::derive_case(index, root, ordinal, &seen)?;
        seen.push(case.clone());
        eval.push(case);
    }
    Ok(Challenge {
        schema: CHALLENGE_SCHEMA.into(),
        id: challenge::challenge_id(index),
        index,
        generator: GENERATOR_VERSION,
        family: public.family.clone(),
        band: difficulty,
        editable: public.editable,
        witness: public.witness,
        train: public.train,
        eval,
    })
}

/// Canonical entrant identity for a submission: the trimmed agent name.
/// Anonymous submissions cannot enter a season — there is nothing to key the
/// derived split on.
pub fn entrant_of(submission: &Submission) -> Result<String, String> {
    submission
        .agent
        .as_ref()
        .map(|agent| agent.name.trim())
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "Season submissions need a named agent.".into())
}

fn refused(reason: impl Into<String>, submission_hash: &str) -> Admission {
    Admission {
        schema: ADMISSION_SCHEMA.into(),
        admitted: false,
        entry: 0,
        reason: reason.into(),
        submission_hash: submission_hash.into(),
    }
}

/// Admission decision for one submission. A well-formed submission is either
/// admitted with its 1-based entry ordinal or refused with a reason; malformed
/// artifacts are errors, not refusals.
pub fn admit(
    season: &Season,
    prior: &[SeasonResult],
    submission: &Submission,
) -> Result<Admission, String> {
    let submission_hash = artifact_hash(&submission.programs)?;
    season_index(season)?;
    if season.status != "open" {
        return Ok(refused(
            format!("season is {}", season.status),
            &submission_hash,
        ));
    }
    let index = match challenge::parse_id(&submission.challenge) {
        Ok(index) if season.challenges.contains(&index) => index,
        _ => {
            return Ok(refused(
                "challenge is not in the season window",
                &submission_hash,
            ));
        }
    };
    let Ok(entrant) = entrant_of(submission) else {
        return Ok(refused("submission names no entrant", &submission_hash));
    };
    let scored: Vec<&SeasonResult> = prior
        .iter()
        .filter(|result| result.season == season.id && result.entrant == entrant)
        .collect();
    if scored.len() as u32 >= season.max_entries {
        return Ok(refused("entry quota reached", &submission_hash));
    }
    // An identical resubmission on the same challenge is a retry, not a new
    // entry; the same program on another challenge is a distinct attempt.
    if scored.iter().any(|result| {
        result.result.submission_hash == submission_hash
            && result.result.challenge == submission.challenge
    }) {
        return Ok(refused("duplicate", &submission_hash));
    }
    // The same schema, target id, and editable-key check the challenge path
    // applies; the real eval still follows admission.
    challenge::check_submission(&challenge::generate(index)?, submission)?;
    // The next ordinal follows the highest issued entry, not the count, so a
    // gapped results ledger can never collide with a committed entry.
    let entry = scored.iter().map(|result| result.entry).max().unwrap_or(0) + 1;
    Ok(Admission {
        schema: ADMISSION_SCHEMA.into(),
        admitted: true,
        entry,
        reason: "admitted".into(),
        submission_hash,
    })
}

/// Score one admitted entry. Open seasons only: once an operator closes or
/// reveals a season, no new scoring starts; issued results stay verifiable.
pub fn evaluate_entry(
    season: &Season,
    salt: &[u8],
    submission: &Submission,
    entry: u32,
) -> Result<SeasonResult, String> {
    if season.status != "open" {
        return Err(format!(
            "Season {} is {}; only an open season scores entries.",
            season.id, season.status
        ));
    }
    if entry == 0 || entry > season.max_entries {
        return Err(format!(
            "Season entry ordinals run 1..={}.",
            season.max_entries
        ));
    }
    let entrant = entrant_of(submission)?;
    let index = challenge::parse_id(&submission.challenge)?;
    let challenge = season_challenge(season, salt, &entrant, entry, index)?;
    let result = challenge::evaluate(&challenge, submission)?;
    Ok(SeasonResult {
        schema: SEASON_RESULT_SCHEMA.into(),
        season: season.id.clone(),
        commitment: season.commitment.clone(),
        entrant,
        entry,
        result,
    })
}

/// Verify a season result. Without the salt this replays every receipt through
/// the standalone checker and audits the result's internal arithmetic — it
/// proves the runs are real but not that they were the derived ones, so the
/// derivation reports "withheld". With the salt (or a revealed season record)
/// the derived split is recomputed and re-evaluated: "revealed".
pub fn verify_season_result(
    season: &Season,
    result: &SeasonResult,
    salt: Option<&[u8]>,
) -> Result<SeasonVerification, String> {
    season_index(season)?;
    if result.schema != SEASON_RESULT_SCHEMA {
        return Err("Season result schema must be platonik-season-result-v1.".into());
    }
    if result.season != season.id {
        return Err("Season result names a different season.".into());
    }
    if result.commitment != season.commitment {
        return Err("Season result commitment does not match the season.".into());
    }
    if result.entrant.trim().is_empty() || result.entrant != result.entrant.trim() {
        return Err("Season result needs a canonically named entrant.".into());
    }
    if result.entry == 0 {
        return Err("Season result entry ordinals are 1-based.".into());
    }
    if result.entry > season.max_entries {
        return Err("Season result entry ordinal exceeds the season quota.".into());
    }
    let inner = &result.result;
    if inner.schema != RESULT_SCHEMA {
        return Err("Inner result schema must be platonik-challenge-result-v1.".into());
    }
    if inner.generator != GENERATOR_VERSION {
        return Err(format!(
            "Result generator {} does not match {GENERATOR_VERSION}.",
            inner.generator
        ));
    }
    let index = challenge::parse_id(&inner.challenge)?;
    if inner.index != index {
        return Err("Result challenge id does not match its index.".into());
    }
    if !season.challenges.contains(&index) {
        return Err("Result challenge is not in the season window.".into());
    }
    if inner.cases.len() != EVAL_CASES || inner.receipts.len() != inner.cases.len() {
        return Err("Result case and receipt counts are inconsistent.".into());
    }
    if inner.cases_total as usize != inner.cases.len() {
        return Err("Result cases_total disagrees with its case list.".into());
    }
    let total_work = inner
        .cases
        .iter()
        .try_fold(0u64, |sum, case| sum.checked_add(case.work))
        .ok_or("Result work total overflows its declared integer width.")?;
    if total_work != inner.total_work {
        return Err("Result total_work is not the sum of its case work.".into());
    }
    let cases_passed = inner.cases.iter().filter(|case| case.passed).count() as u32;
    if cases_passed != inner.cases_passed {
        return Err("Result cases_passed disagrees with its case list.".into());
    }
    if inner.passed != (inner.cases_passed == inner.cases_total) {
        return Err("Result pass flag disagrees with its case accounting.".into());
    }
    // Each case must describe a receipt that itself replays under the
    // standalone checker — the same one `platonik verify` uses — and every
    // receipt must carry the same editable programs: a result cannot mix the
    // best run of different submissions.
    let public = challenge::generate(index)?;
    let mut programs: Option<BTreeMap<String, _>> = None;
    let mut experiments = std::collections::BTreeSet::new();
    for (ordinal, (case, receipt)) in inner.cases.iter().zip(inner.receipts.iter()).enumerate() {
        let report = check::verify_receipt(receipt)
            .map_err(|error| format!("receipt {}: {error}", ordinal + 1))?;
        if case.id != format!("eval-{}", ordinal + 1)
            || case.experiment_hash != receipt.experiment_hash
            || case.receipt_hash != receipt.result_hash
            || case.passed != receipt.passed()
            || case.status != receipt.result.status
            || case.work != report.work
        {
            return Err(format!(
                "Case {} does not describe its receipt.",
                ordinal + 1
            ));
        }
        if !experiments.insert(&receipt.experiment_hash) {
            return Err(format!(
                "Case {} repeats an earlier experiment.",
                ordinal + 1
            ));
        }
        let mut extracted = BTreeMap::new();
        for id in &public.editable {
            let cell = receipt
                .experiment
                .cells
                .iter()
                .find(|cell| cell.id == *id)
                .ok_or("Result receipts do not cover the editable cells.")?;
            extracted.insert(id.to_string(), cell.program.clone());
        }
        match &programs {
            None => programs = Some(extracted),
            Some(existing) if existing == &extracted => {}
            Some(_) => {
                return Err(format!(
                    "Receipt {} ran different editable programs.",
                    ordinal + 1
                ));
            }
        }
    }
    // The receipt experiments carry the submitted programs; the claimed
    // submission hash and byte count must match them.
    let programs = programs.ok_or("Result carries no receipts.")?;
    if artifact_hash(&programs)? != inner.submission_hash {
        return Err("Result submission hash does not match the receipt programs.".into());
    }
    if serde_json::to_vec(&programs)
        .map_err(|error| error.to_string())?
        .len() as u64
        != inner.program_bytes
    {
        return Err("Result program bytes do not match the receipt programs.".into());
    }
    if let Some(agent) = &inner.agent
        && agent.name.trim() != result.entrant
    {
        return Err("Season result entrant disagrees with its agent report.".into());
    }
    let embedded = season.salt.as_deref().map(parse_salt_hex).transpose()?;
    let derivation = match salt.map(<[u8]>::to_vec).or(embedded) {
        Some(key) => {
            let derived = season_challenge(season, &key, &result.entrant, result.entry, index)?;
            challenge::verify_against(&derived, inner)?;
            "revealed"
        }
        None => "withheld",
    };
    Ok(SeasonVerification {
        schema: SEASON_VERIFY_SCHEMA.into(),
        verified: true,
        season: result.season.clone(),
        entrant: result.entrant.clone(),
        entry: result.entry,
        passed: inner.passed,
        cases_passed: inner.cases_passed,
        total_work: inner.total_work,
        submission_hash: inner.submission_hash.clone(),
        derivation: derivation.into(),
    })
}

/// Rank a season's results with the same ordering the public board uses. Every
/// entry must verify against the season first — a board only admits verified
/// entries, so a failed result is an error, not a skipped row.
pub fn season_board(season: &Season, results: &[SeasonResult]) -> Result<SeasonBoard, String> {
    for result in results {
        verify_season_result(season, result, None)?;
    }
    let inner: Vec<ChallengeResult> = results.iter().map(|result| result.result.clone()).collect();
    let (challenges, global) = challenge::rank_results(&inner);
    Ok(SeasonBoard {
        schema: SEASON_BOARD_SCHEMA.into(),
        season: season.id.clone(),
        commitment: season.commitment.clone(),
        challenges,
        global,
    })
}
