use platonik_core::challenge::{
    self, AgentReport, ChallengeResult, EDITABLE_BUILDER, EDITABLE_COURIER, EDITABLE_KEEPER,
    EVAL_CASES, GENERATOR_VERSION, RESULT_SCHEMA, SUBMISSION_SCHEMA, Submission,
};
use platonik_core::fixtures;
use platonik_core::model::{Action, Condition, Program, Rule};
use platonik_core::season::*;
use std::collections::BTreeMap;

fn salt() -> Vec<u8> {
    (0u8..SALT_BYTES as u8).collect()
}

fn other_salt() -> Vec<u8> {
    salt()
        .into_iter()
        .map(|byte| byte.wrapping_add(SALT_BYTES as u8))
        .collect()
}

fn hex_of(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn open_season() -> Season {
    begin(1, vec![1, 2], 2, &salt()).expect("season opens")
}

fn submission(index: u64, name: &str, program: Program) -> Submission {
    Submission {
        schema: SUBMISSION_SCHEMA.into(),
        challenge: challenge::challenge_id(index),
        programs: BTreeMap::from([(EDITABLE_COURIER.to_string(), program)]),
        agent: Some(AgentReport {
            name: name.into(),
            tokens: None,
            notes: None,
        }),
    }
}

/// A resilient courier carrying one never-true guard, so every activation pays
/// an extra checked condition. It solves the same cases at higher work.
fn guarded_courier() -> Program {
    let mut rules = vec![Rule {
        when: vec![Condition::Memory {
            slot: 3,
            value: 255,
        }],
        action: Action::Wait,
        remember: None,
    }];
    rules.extend(fixtures::resilient_courier().rules);
    Program { rules }
}

#[test]
fn season_ids_parse_strictly() {
    assert_eq!(season_id(7), "season-0007");
    assert_eq!(parse_season_id("season-0007").unwrap(), 7);
    assert_eq!(parse_season_id("season-9999").unwrap(), 9999);
    assert!(parse_season_id("season-0000").is_err());
    assert!(parse_season_id("season-10000").is_err());
    assert!(parse_season_id("season-07").is_err());
    assert!(parse_season_id("challenge-0007").is_err());
    assert!(parse_season_id("season-1x34").is_err());
}

#[test]
fn challenge_lists_parse_commas_and_ranges() {
    assert_eq!(parse_challenge_list("1,2,3").unwrap(), vec![1, 2, 3]);
    assert_eq!(parse_challenge_list("1-4").unwrap(), vec![1, 2, 3, 4]);
    assert_eq!(parse_challenge_list("1-2,7").unwrap(), vec![1, 2, 7]);
    assert_eq!(parse_challenge_list(" 9 , 7 ").unwrap(), vec![9, 7]);
    assert!(parse_challenge_list("").is_err());
    assert!(parse_challenge_list("1,,2").is_err());
    assert!(parse_challenge_list("0").is_err());
    assert!(parse_challenge_list("10000").is_err());
    assert!(parse_challenge_list("4-2").is_err());
    assert!(parse_challenge_list("a-b").is_err());
    assert!(parse_challenge_list("1-9999").is_err());
}

#[test]
fn salt_hex_parses_trimmed_in_either_case() {
    let salt = salt();
    let hex = hex_of(&salt);
    assert_eq!(parse_salt_hex(&hex).unwrap(), salt);
    assert_eq!(parse_salt_hex(&hex.to_uppercase()).unwrap(), salt);
    assert_eq!(parse_salt_hex(&format!("  {hex}\n")).unwrap(), salt);
    assert!(parse_salt_hex(&hex[..62]).is_err());
    assert!(parse_salt_hex(&format!("{hex}00")).is_err());
    let mut bad = hex.clone();
    bad.replace_range(0..1, "z");
    assert!(parse_salt_hex(&bad).is_err());
    assert!(parse_salt_hex("").is_err());
}

#[test]
fn salt_commitment_is_stable_and_tamper_evident() {
    let salt = salt();
    let first = salt_commitment(1, &salt).unwrap();
    assert_eq!(first, salt_commitment(1, &salt).unwrap());
    assert!(first.starts_with("sha256:"));
    // One flipped salt byte is a different record.
    let mut flipped = salt.clone();
    flipped[0] ^= 0xff;
    assert_ne!(first, salt_commitment(1, &flipped).unwrap());
    // So is the same salt under another season index.
    assert_ne!(first, salt_commitment(2, &salt).unwrap());
    assert!(salt_commitment(0, &salt).is_err());
    assert!(salt_commitment(10_000, &salt).is_err());
    assert!(salt_commitment(1, &salt[..31]).is_err());
    assert!(salt_commitment(1, &(0u8..=SALT_BYTES as u8).collect::<Vec<u8>>()).is_err());
}

#[test]
fn begin_validates_index_window_salt_and_quota() {
    let salt = salt();
    assert!(begin(0, vec![1], 1, &salt).is_err());
    assert!(begin(10_000, vec![1], 1, &salt).is_err());
    assert!(begin(1, vec![], 1, &salt).is_err());
    assert!(begin(1, vec![1], 1, &salt[..31]).is_err());
    assert!(
        begin(
            1,
            vec![1],
            1,
            &(0u8..=SALT_BYTES as u8).collect::<Vec<u8>>()
        )
        .is_err()
    );
    assert!(begin(1, vec![1], 0, &salt).is_err());
    assert!(begin(1, vec![1], 257, &salt).is_err());
    // Oversized and out-of-range windows are refused before they score.
    assert!(begin(1, (1..=257).collect(), 1, &salt).is_err());
    assert!(begin(1, vec![0], 1, &salt).is_err());
    assert!(begin(1, vec![1, 10_000], 1, &salt).is_err());
    // Duplicate indices collapse; the stored window is sorted and unique.
    let season = begin(1, vec![3, 1, 3, 2], 4, &salt).unwrap();
    assert_eq!(season.challenges, vec![1, 2, 3]);
    assert_eq!(season.schema, SEASON_SCHEMA);
    assert_eq!(season.id, "season-0001");
    assert_eq!(season.version, SEASON_VERSION);
    assert_eq!(season.generator, GENERATOR_VERSION);
    assert_eq!(season.commitment, salt_commitment(1, &salt).unwrap());
    assert_eq!(season.status, "open");
    assert_eq!(season.salt, None);
}

#[test]
fn season_challenge_is_deterministic_and_keyed_by_entrant_and_entry() {
    let season = open_season();
    let salt = salt();
    let first = season_challenge(&season, &salt, "github:alice", 1, 1).unwrap();
    let again = season_challenge(&season, &salt, "github:alice", 1, 1).unwrap();
    assert_eq!(first, again, "same derivation inputs must agree");

    let other_entrant = season_challenge(&season, &salt, "github:bob", 1, 1).unwrap();
    assert_ne!(first.eval, other_entrant.eval);
    let second_entry = season_challenge(&season, &salt, "github:alice", 2, 1).unwrap();
    assert_ne!(first.eval, second_entry.eval);
    let other_index = season_challenge(&season, &salt, "github:alice", 1, 2).unwrap();
    assert_ne!(first.eval, other_index.eval);

    // The season split shares the public train cases but not the public eval.
    let public = challenge::generate(1).unwrap();
    assert_eq!(first.train, public.train);
    assert_ne!(first.eval, public.eval);
    assert_eq!(first.eval.len(), EVAL_CASES);
    assert_eq!(first.id, "challenge-0001");
    assert_eq!(first.editable, public.editable);
    assert_eq!(first.band, public.band);

    assert!(season_challenge(&season, &other_salt(), "github:alice", 1, 1).is_err());
    assert!(season_challenge(&season, &salt[..31], "github:alice", 1, 1).is_err());
    assert!(season_challenge(&season, &salt, "github:alice", 1, 9).is_err());
    assert!(season_challenge(&season, &salt, "github:alice", 0, 1).is_err());
    assert!(season_challenge(&season, &salt, "   ", 1, 1).is_err());
}

#[test]
fn season_eval_cases_are_witness_admitted() {
    // Season cases come from the same witnessed draw as public cases, so the
    // public witness policy still clears the reserved eval split.
    let season = open_season();
    let derived = season_challenge(&season, &salt(), "github:alice", 1, 1).unwrap();
    let result = challenge::evaluate(
        &derived,
        &submission(1, "github:alice", fixtures::resilient_courier()),
    )
    .unwrap();
    assert!(result.passed);
    assert_eq!(result.cases_passed, EVAL_CASES as u32);
}

#[test]
fn season_derivation_follows_the_challenge_family() {
    // A manifest may name any published index: the salted split uses that
    // index's own family draw, editable cell, and witness.
    let season = begin(1, vec![40, 70], 2, &salt()).expect("season opens");
    let derived = season_challenge(&season, &salt(), "github:alice", 1, 40).unwrap();
    assert_eq!(derived.family, "switchboard");
    assert_eq!(derived.editable, vec![EDITABLE_KEEPER]);
    assert_eq!(derived.witness, "switchboard_keeper");

    let keeper = Submission {
        challenge: derived.id.clone(),
        programs: BTreeMap::from([(EDITABLE_KEEPER.to_string(), fixtures::switchboard_keeper())]),
        ..submission(40, "github:alice", Program { rules: Vec::new() })
    };
    let result = challenge::evaluate(&derived, &keeper).unwrap();
    assert!(result.passed);
    assert_eq!(result.cases_passed, EVAL_CASES as u32);

    // The same salted path derives foundry cases with the builder witness.
    let derived = season_challenge(&season, &salt(), "github:alice", 1, 70).unwrap();
    assert_eq!(derived.family, "foundry");
    assert_eq!(derived.editable, vec![EDITABLE_BUILDER]);
    assert_eq!(derived.witness, "foundry_builder");
    let builder = Submission {
        challenge: derived.id.clone(),
        programs: BTreeMap::from([(EDITABLE_BUILDER.to_string(), fixtures::foundry_builder())]),
        ..submission(70, "github:alice", Program { rules: Vec::new() })
    };
    let result = challenge::evaluate(&derived, &builder).unwrap();
    assert!(result.passed);
    assert_eq!(result.cases_passed, EVAL_CASES as u32);
}

#[test]
fn admission_enforces_status_window_entrant_quota_and_dedup() {
    let season = open_season();
    let salt = salt();
    let alice = submission(1, "github:alice", fixtures::resilient_courier());

    let first = admit(&season, &[], &alice).unwrap();
    assert!(first.admitted);
    assert_eq!(first.entry, 1);
    assert_eq!(first.schema, ADMISSION_SCHEMA);

    // A distinct second submission earns the next ordinal.
    let alice_compact = submission(1, "github:alice", fixtures::compact_courier());
    let prior_one = evaluate_entry(&season, &salt, &alice, first.entry).unwrap();
    let second = admit(&season, std::slice::from_ref(&prior_one), &alice_compact).unwrap();
    assert!(second.admitted && second.entry == 2);

    // The same program bytes under the same entrant are a duplicate, not an entry.
    let duplicate = admit(&season, std::slice::from_ref(&prior_one), &alice).unwrap();
    assert!(!duplicate.admitted);
    assert_eq!(duplicate.reason, "duplicate");

    // A third entry exceeds the per-entrant quota.
    let prior_two = evaluate_entry(&season, &salt, &alice_compact, second.entry).unwrap();
    let quota = admit(&season, &[prior_one, prior_two], &alice_compact).unwrap();
    assert!(!quota.admitted);
    assert_eq!(quota.reason, "entry quota reached");

    // Challenges outside the window and anonymous submissions are refused.
    let outside = submission(9, "github:alice", fixtures::resilient_courier());
    assert!(!admit(&season, &[], &outside).unwrap().admitted);
    let malformed_id = submission(1, "github:alice", fixtures::resilient_courier());
    let mut malformed_id = malformed_id;
    malformed_id.challenge = "not-a-challenge".into();
    assert!(!admit(&season, &[], &malformed_id).unwrap().admitted);
    let mut anonymous = submission(1, "", fixtures::resilient_courier());
    anonymous.agent = None;
    assert!(!admit(&season, &[], &anonymous).unwrap().admitted);
    let whitespace = submission(1, "   ", fixtures::resilient_courier());
    assert!(!admit(&season, &[], &whitespace).unwrap().admitted);

    // Closed and revealed seasons stop admitting.
    let mut closed = season.clone();
    closed.status = "closed".into();
    assert!(!admit(&closed, &[], &alice).unwrap().admitted);
    let revealed = reveal(&season, &salt).unwrap();
    assert!(!admit(&revealed, &[], &alice).unwrap().admitted);

    // Malformed artifacts are errors, not refusals.
    let mut extra_key = submission(1, "github:alice", fixtures::resilient_courier());
    extra_key
        .programs
        .insert("99".into(), fixtures::idle_program());
    assert!(admit(&season, &[], &extra_key).is_err());
    let mut wrong_schema = submission(1, "github:alice", fixtures::resilient_courier());
    wrong_schema.schema = "bogus".into();
    assert!(admit(&season, &[], &wrong_schema).is_err());
}

#[test]
fn the_same_program_on_another_challenge_is_a_distinct_entry() {
    let season = open_season(); // window {1, 2}, max_entries 2
    let salt = salt();
    let alice = submission(1, "github:alice", fixtures::resilient_courier());
    let first = admit(&season, &[], &alice).unwrap();
    let prior = evaluate_entry(&season, &salt, &alice, first.entry).unwrap();

    // Identical program bytes on the same challenge: an uncharged retry.
    assert!(
        !admit(&season, std::slice::from_ref(&prior), &alice)
            .unwrap()
            .admitted
    );
    // The same program on a different challenge: fresh withheld cases, a real entry.
    let mut second = submission(2, "github:alice", fixtures::resilient_courier());
    let admitted = admit(&season, &[prior], &second).unwrap();
    assert!(admitted.admitted);
    assert_eq!(admitted.entry, 2);

    // A malformed season envelope is an error, never an admission decision.
    let mut bad_schema = season.clone();
    bad_schema.schema = "bogus".into();
    assert!(admit(&bad_schema, &[], &second).is_err());
    let mut bad_status = season.clone();
    bad_status.status = "paused".into();
    assert!(admit(&bad_status, &[], &second).is_err());
    let mut bad_commitment = season.clone();
    bad_commitment.commitment = "sha256:zzz".into();
    assert!(admit(&bad_commitment, &[], &second).is_err());
    // A salted manifest that claims to still be open cannot stand.
    let mut premature = reveal(&season, &salt).unwrap();
    premature.status = "open".into();
    assert!(admit(&premature, &[], &second).is_err());
    // And entry ordinals beyond the quota cannot be scored or verified.
    second.challenge = challenge::challenge_id(1);
    assert!(evaluate_entry(&season, &salt, &second, 3).is_err());
    let mut over = evaluate_entry(&season, &salt, &alice, 2).unwrap();
    over.entry = 3;
    assert!(verify_season_result(&season, &over, Some(&salt)).is_err());
}

#[test]
fn withheld_verification_rejects_mixed_program_receipts() {
    let season = open_season();
    let salt = salt();
    // Two honest results for one entrant: same season, different entries and
    // therefore different derived case sets.
    let first = evaluate_entry(
        &season,
        &salt,
        &submission(1, "github:alice", fixtures::resilient_courier()),
        1,
    )
    .unwrap();
    let second = evaluate_entry(
        &season,
        &salt,
        &submission(1, "github:alice", guarded_courier()),
        2,
    )
    .unwrap();
    // Forge a best-of-both result: entry 1's first case+receipt, then entry 2's
    // remaining cases+receipts — every case still describes its receipt.
    let mut forged = first.clone();
    for slot in 1..EVAL_CASES {
        forged.result.cases[slot] = second.result.cases[slot].clone();
        forged.result.receipts[slot] = second.result.receipts[slot].clone();
    }
    forged.result.total_work = forged.result.cases.iter().map(|case| case.work).sum();
    forged.result.cases_passed = forged
        .result
        .cases
        .iter()
        .filter(|case| case.passed)
        .count() as u32;
    forged.result.passed = forged.result.cases_passed == forged.result.cases_total;
    // The receipts replay individually but carry two different programs.
    assert!(verify_season_result(&season, &forged, None).is_err());

    // Duplicating one receipt across two case slots is likewise refused.
    let mut repeated = first.clone();
    repeated.result.cases[1] = repeated.result.cases[0].clone();
    repeated.result.cases[1].id = "eval-2".into();
    repeated.result.receipts[1] = repeated.result.receipts[0].clone();
    repeated.result.total_work = repeated.result.cases.iter().map(|case| case.work).sum();
    repeated.result.cases_passed = repeated
        .result
        .cases
        .iter()
        .filter(|case| case.passed)
        .count() as u32;
    repeated.result.passed = repeated.result.cases_passed == repeated.result.cases_total;
    assert!(verify_season_result(&season, &repeated, None).is_err());
}

#[test]
fn evaluate_entry_scores_only_open_seasons_and_named_entrants() {
    let season = open_season();
    let salt = salt();
    let alice = submission(1, "github:alice", fixtures::resilient_courier());

    let result = evaluate_entry(&season, &salt, &alice, 1).unwrap();
    assert_eq!(result.schema, SEASON_RESULT_SCHEMA);
    assert_eq!(result.season, season.id);
    assert_eq!(result.commitment, season.commitment);
    assert_eq!(result.entrant, "github:alice");
    assert_eq!(result.entry, 1);
    assert_eq!(result.result.schema, RESULT_SCHEMA);
    assert!(result.result.passed);

    // The entrant identity is trimmed to its canonical form.
    let padded = submission(1, "  github:alice  ", fixtures::resilient_courier());
    let result = evaluate_entry(&season, &salt, &padded, 1).unwrap();
    assert_eq!(result.entrant, "github:alice");

    assert!(evaluate_entry(&season, &salt, &alice, 0).is_err());
    assert!(evaluate_entry(&season, &other_salt(), &alice, 1).is_err());
    let outside = submission(9, "github:alice", fixtures::resilient_courier());
    assert!(evaluate_entry(&season, &salt, &outside, 1).is_err());
    let mut anonymous = alice.clone();
    anonymous.agent = None;
    assert!(evaluate_entry(&season, &salt, &anonymous, 1).is_err());

    let mut closed = season.clone();
    closed.status = "closed".into();
    assert!(evaluate_entry(&closed, &salt, &alice, 1).is_err());
    let revealed = reveal(&season, &salt).unwrap();
    assert!(evaluate_entry(&revealed, &salt, &alice, 1).is_err());
}

#[test]
fn withheld_verification_replays_receipts_and_rejects_tampering() {
    let season = open_season();
    let salt = salt();
    let alice = submission(1, "github:alice", fixtures::resilient_courier());
    let result = evaluate_entry(&season, &salt, &alice, 1).unwrap();

    // No salt: receipts still replay under the standalone checker and the
    // arithmetic is audited.
    let report = verify_season_result(&season, &result, None).unwrap();
    assert!(report.verified);
    assert!(report.passed);
    assert_eq!(report.derivation, "withheld");
    assert_eq!(report.schema, SEASON_VERIFY_SCHEMA);
    assert_eq!(report.season, season.id);
    assert_eq!(report.entrant, "github:alice");
    assert_eq!(report.entry, 1);
    assert_eq!(report.cases_passed, EVAL_CASES as u32);
    assert_eq!(report.total_work, result.result.total_work);
    assert_eq!(report.submission_hash, result.result.submission_hash);

    let mut forged_work = result.clone();
    forged_work.result.total_work += 1;
    assert!(verify_season_result(&season, &forged_work, None).is_err());

    let mut forged_case = result.clone();
    forged_case.result.cases[0].work += 1;
    assert!(verify_season_result(&season, &forged_case, None).is_err());

    let mut miscounted = result.clone();
    miscounted.result.cases_total += 1;
    assert!(verify_season_result(&season, &miscounted, None).is_err());

    let mut miscounted_passed = result.clone();
    miscounted_passed.result.cases_passed -= 1;
    assert!(verify_season_result(&season, &miscounted_passed, None).is_err());

    // A swapped-in genuine receipt still fails its case binding.
    let mut swapped = result.clone();
    swapped.result.receipts[0] = result.result.receipts[1].clone();
    assert!(verify_season_result(&season, &swapped, None).is_err());

    let mut dropped = result.clone();
    dropped.result.receipts.pop();
    assert!(verify_season_result(&season, &dropped, None).is_err());

    let mut wrong_commitment = result.clone();
    wrong_commitment.commitment = salt_commitment(1, &other_salt()).unwrap();
    assert!(verify_season_result(&season, &wrong_commitment, None).is_err());

    let mut wrong_season = result.clone();
    wrong_season.season = "season-0002".into();
    assert!(verify_season_result(&season, &wrong_season, None).is_err());

    let mut zero_entry = result.clone();
    zero_entry.entry = 0;
    assert!(verify_season_result(&season, &zero_entry, None).is_err());

    let mut no_entrant = result.clone();
    no_entrant.entrant = " ".into();
    assert!(verify_season_result(&season, &no_entrant, None).is_err());

    let mut outside = result.clone();
    outside.result.challenge = challenge::challenge_id(9);
    outside.result.index = 9;
    assert!(verify_season_result(&season, &outside, None).is_err());

    let mut wrong_generator = result.clone();
    wrong_generator.result.generator = GENERATOR_VERSION + 1;
    assert!(verify_season_result(&season, &wrong_generator, None).is_err());
}

#[test]
fn revealed_verification_recomputes_the_derived_split() {
    let season = open_season();
    let salt = salt();
    let alice = submission(1, "github:alice", fixtures::resilient_courier());
    let result = evaluate_entry(&season, &salt, &alice, 1).unwrap();

    let report = verify_season_result(&season, &result, Some(&salt)).unwrap();
    assert!(report.verified && report.passed);
    assert_eq!(report.derivation, "revealed");

    // A revealed season record carries the salt itself.
    let revealed = reveal(&season, &salt).unwrap();
    let embedded = verify_season_result(&revealed, &result, None).unwrap();
    assert_eq!(embedded.derivation, "revealed");

    // A wrong salt fails the commitment check during derivation.
    assert!(verify_season_result(&season, &result, Some(&other_salt())).is_err());

    // Genuine receipts from the public eval pass withheld verification — they
    // are real runs — but the salt proves they were not the derived cases.
    let public = challenge::generate(1).unwrap();
    let public_result = challenge::evaluate(&public, &alice).unwrap();
    let forged = SeasonResult {
        schema: SEASON_RESULT_SCHEMA.into(),
        season: season.id.clone(),
        commitment: season.commitment.clone(),
        entrant: "github:alice".into(),
        entry: 1,
        result: public_result,
    };
    let withheld = verify_season_result(&season, &forged, None).unwrap();
    assert!(withheld.verified);
    assert_eq!(withheld.derivation, "withheld");
    assert!(verify_season_result(&season, &forged, Some(&salt)).is_err());
}

#[test]
fn reveal_embeds_the_salt_only_when_it_matches() {
    let season = open_season();
    let salt = salt();
    assert!(reveal(&season, &other_salt()).is_err());
    assert!(reveal(&season, &salt[..31]).is_err());
    let revealed = reveal(&season, &salt).unwrap();
    assert_eq!(revealed.status, "revealed");
    assert_eq!(revealed.salt.as_deref(), Some(hex_of(&salt).as_str()));
    assert_eq!(revealed.commitment, season.commitment);
    // The stored hex parses back to the same bytes.
    assert_eq!(
        parse_salt_hex(revealed.salt.as_deref().unwrap()).unwrap(),
        salt
    );
}

#[test]
fn season_board_ranks_verified_results_like_the_public_board() {
    let season = open_season();
    let salt = salt();
    let alice = evaluate_entry(
        &season,
        &salt,
        &submission(1, "github:alice", fixtures::resilient_courier()),
        1,
    )
    .unwrap();
    let bob = evaluate_entry(
        &season,
        &salt,
        &submission(1, "github:bob", guarded_courier()),
        1,
    )
    .unwrap();
    let carol = evaluate_entry(
        &season,
        &salt,
        &submission(2, "github:carol", fixtures::idle_program()),
        1,
    )
    .unwrap();
    assert!(alice.result.passed && bob.result.passed);
    assert!(!carol.result.passed);
    assert!(bob.result.total_work > alice.result.total_work);

    let board = season_board(&season, &[bob.clone(), carol.clone(), alice.clone()]).unwrap();
    assert_eq!(board.schema, SEASON_BOARD_SCHEMA);
    assert_eq!(board.season, season.id);
    assert_eq!(board.commitment, season.commitment);

    // The ranking core is the public board's: same inputs, same ordering.
    let inners: Vec<ChallengeResult> = [alice.clone(), bob.clone(), carol.clone()]
        .iter()
        .map(|result| result.result.clone())
        .collect();
    let public_board = challenge::board(&inners);
    assert_eq!(board.challenges, public_board.challenges);
    assert_eq!(board.global, public_board.global);

    // Clears rank ahead of fails, then less work ahead of more.
    let first = board
        .challenges
        .iter()
        .find(|board| board.challenge == "challenge-0001")
        .unwrap();
    assert_eq!(first.rows.len(), 2);
    assert_eq!(first.rows[0].entrant, "github:alice");
    assert_eq!(first.rows[1].entrant, "github:bob");
    let second = board
        .challenges
        .iter()
        .find(|board| board.challenge == "challenge-0002")
        .unwrap();
    assert_eq!(second.rows[0].entrant, "github:carol");
    assert_eq!(board.global[0].entrant, "github:alice");
    assert_eq!(board.global[0].cleared, 1);

    // An entry that fails verification is an error, not a skipped row.
    let mut forged = alice.clone();
    forged.result.total_work += 1;
    assert!(season_board(&season, &[forged]).is_err());
}
