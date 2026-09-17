use platonik_core::challenge::*;
use platonik_core::check::artifact_hash;
use platonik_core::fixtures;
use platonik_core::model::*;
use std::collections::BTreeMap;

fn submission(challenge: &str, program: Program, name: &str) -> Submission {
    submission_on(challenge, EDITABLE_COURIER, program, name)
}

fn submission_on(challenge: &str, cell: u16, program: Program, name: &str) -> Submission {
    Submission {
        schema: SUBMISSION_SCHEMA.into(),
        challenge: challenge.into(),
        programs: BTreeMap::from([(cell.to_string(), program)]),
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

/// Canonical bundle hashes recorded at the commit that introduced the
/// family split: every crossing id must keep producing exactly these bytes.
const CROSSING_HASHES: [(u64, &str); 32] = [
    (
        1,
        "sha256:6d5df8c9394e88052d3de1498625c6404d5549cc330b5cd1f04c80670a10f0f7",
    ),
    (
        2,
        "sha256:ae62b76e622ff67a31ef06db5e03c189f35e3a083a5db171105c0cee12131c53",
    ),
    (
        3,
        "sha256:cd95d1c1ca103577e47e4580e3313089d3346675bf6839dace21dc7ff3525700",
    ),
    (
        4,
        "sha256:f21d337a6a839c8dce4d3a4db6f030c443851048029e2283b256b4d10ea2fb79",
    ),
    (
        5,
        "sha256:400ef06598bc76c0269fdaade899ccbf36777d707d6cd8522c11284544454468",
    ),
    (
        6,
        "sha256:6b5e395e18eeb6cce7435eacf1693daf12c7a40c0684ee898f446ac59fe123a3",
    ),
    (
        7,
        "sha256:4e79a0fc2eb6f51a6c005ab0daf13c6ab42802f07c8ea66f6c4c884a64f3b730",
    ),
    (
        8,
        "sha256:82621db28f636a9e532d8b16cdb5e2c133579409ca2474fccc48a607e031e4c1",
    ),
    (
        9,
        "sha256:e637f80eed0759e6e6d9a68c58611f2a139ba91365b1efa9e75e83873a9b59a8",
    ),
    (
        10,
        "sha256:40c7b927b6f0a44d0126df9d5a6f45e210640c23f3e277edb084a4d57a366f5d",
    ),
    (
        11,
        "sha256:43a458a14d899e684805cffe597688c73d7c9187ff4dfb3eb45f938da0eb57ce",
    ),
    (
        12,
        "sha256:48cd9d26f88c38d24e096da251d0b2f5abcb7af58071d34fea3570c9085a7114",
    ),
    (
        13,
        "sha256:c61f280779a05c88ab209fa7db90430bf91128560f3185735103125301dfadd2",
    ),
    (
        14,
        "sha256:9eeb47f8792c93092490a95936c174df8d36494ed31f771168a41a5b9932aae6",
    ),
    (
        15,
        "sha256:0056c94fc4dbaaca2abef5532c53399e8c5209446d9ef50e17d0751da4c44f1c",
    ),
    (
        16,
        "sha256:0b6c8dba21170863b5a1a5c186b2c1822e4d79c34daa6d7a0ec4bbef02653cc8",
    ),
    (
        17,
        "sha256:03e5e918124931470d2fcb32222a9151c1e7a2de4461cc7251563f224492f374",
    ),
    (
        18,
        "sha256:84d6ea1c14abb2d520087d8f41c3b457963fea0f0dc54f8d2f516767dfac19d1",
    ),
    (
        19,
        "sha256:485a20555668f65efacd759605f7c88f2bb16c97c31eea24b6a9ee7469f27827",
    ),
    (
        20,
        "sha256:04a3e7dd2fa89b86dbd89eeb521301cccbfae986c4395791989387aecbd88f1f",
    ),
    (
        21,
        "sha256:a43f4d327ed923f9a07f2cfc5cee222f87a1346aed9fb1f9a9c430c29b3ee0fd",
    ),
    (
        22,
        "sha256:9c0664329d8434fa941ce2fa91ce9ed4c789b25265ec02734ec13706f012a942",
    ),
    (
        23,
        "sha256:b7c376e85971a8a36c4f6a65fa8b8060710ffb199403fd25650acee1365ad40d",
    ),
    (
        24,
        "sha256:5b0961e24a1fc3205a873c2afc9d36301b2c62bc9d949c7385c53f232e447479",
    ),
    (
        25,
        "sha256:c86f74cc9419b391333e3d31267e6def5fd69afabb35a62d64b1813907ce36f0",
    ),
    (
        26,
        "sha256:e24a1d117b9a003210bf032ebe38a081bdef2088a2a504e434695d63cefb2a15",
    ),
    (
        27,
        "sha256:f5980d0908fdacbaa88a3c14e374368596115836a1d4c59087baa8fc6ee29a6b",
    ),
    (
        28,
        "sha256:c77fb667661bed8439c2fcb762ebbef3c2e153f264822f10c517271c79ad36fa",
    ),
    (
        29,
        "sha256:91d0400aad2702bddd10c671d22434332dbb49e8f1404b8042ddcb2ffddf44cc",
    ),
    (
        30,
        "sha256:b3b2198807f6dc9b6618185daaca984c1b762f6a6493fe49ae620576f40b8c73",
    ),
    (
        31,
        "sha256:e986a7b7cf284fe2954d4665943581c8580803e88e3a93fcd264c36478a037ea",
    ),
    (
        32,
        "sha256:61682cc011812d2610034e863a324817ea151eaac008ac0bb52cdd65c3e7f7a5",
    ),
];

#[test]
fn every_published_challenge_generates_deterministically_with_witnessed_cases() {
    for index in 1..=PUBLISHED_CHALLENGES {
        let first = generate(index).expect("published challenge generates");
        let second = generate(index).expect("published challenge generates again");
        assert_eq!(first, second, "challenge {index} must be deterministic");
        assert_eq!(first.train.len(), TRAIN_CASES);
        assert_eq!(first.eval.len(), EVAL_CASES);
        for case in first.train.iter().chain(first.eval.iter()) {
            match first.family.as_str() {
                "switchboard" => {
                    assert_eq!(case.cells.len(), 3);
                    let keeper = case
                        .cells
                        .iter()
                        .find(|cell| cell.id == EDITABLE_KEEPER)
                        .expect("switchboard cases carry the keeper cell");
                    assert_eq!(keeper.program, fixtures::idle_program());
                    assert!(!keeper.mobile);
                    assert_eq!(case.valves.len(), 1);
                    assert_eq!(case.depots.len(), 1);
                    assert_eq!(case.depots[0].capacity, 1);
                }
                "foundry" => {
                    assert_eq!(case.cells.len(), 1);
                    let builder = &case.cells[0];
                    assert_eq!(builder.id, EDITABLE_BUILDER);
                    assert_eq!(builder.program, fixtures::idle_program());
                    assert!(!builder.mobile);
                    let spec = case
                        .construction
                        .as_ref()
                        .expect("foundry cases carry a construction catalog");
                    assert_eq!(spec.stocks.len(), 1);
                    assert_eq!(spec.stocks[0].position, builder.position);
                    // Both declared runners target cells adjacent to the
                    // immobile builder; a case may also declare one decoy.
                    let targets: Vec<_> = spec
                        .blueprints
                        .iter()
                        .map(|blueprint| blueprint.body.cell.position)
                        .collect();
                    assert!((2..=3).contains(&targets.len()));
                    assert!(
                        targets
                            .iter()
                            .all(|target| target.distance(builder.position) == 1)
                    );
                    assert!(
                        case.beacons
                            .iter()
                            .all(|beacon| beacon.required_deliveries >= 1)
                    );
                }
                _ => {
                    assert_eq!(first.family, "crossing");
                    assert_eq!(case.cells.len(), 1);
                    assert_eq!(case.cells[0].id, EDITABLE_COURIER);
                    assert_eq!(case.cells[0].program, fixtures::idle_program());
                }
            }
            platonik_core::validate_experiment(case).expect("generated case validates");
        }
    }
}

#[test]
fn crossing_bundles_keep_their_frozen_byte_identities() {
    for (index, expected) in CROSSING_HASHES {
        let challenge = generate(index).expect("crossing challenge generates");
        assert_eq!(challenge.family, "crossing");
        assert_eq!(
            artifact_hash(&challenge).expect("bundle hashes"),
            expected,
            "challenge-{index:04} must keep its committed byte identity"
        );
    }
}

#[test]
fn switchboard_witness_passes_every_published_case() {
    for index in 33..=64 {
        let challenge = generate(index).expect("switchboard challenge generates");
        assert_eq!(challenge.family, "switchboard");
        assert_eq!(challenge.editable, vec![EDITABLE_KEEPER]);
        assert_eq!(challenge.witness, "switchboard_keeper");
        for case in challenge.train.iter().chain(challenge.eval.iter()) {
            let witnessed =
                fixtures::replace_program(case, EDITABLE_KEEPER, fixtures::switchboard_keeper());
            let result = platonik_core::run(&witnessed).expect("case runs");
            assert!(
                result.outcome.passed,
                "the keeper witness must pass every case of challenge-{index:04}"
            );
        }
    }
}

#[test]
fn foundry_witness_passes_every_published_case() {
    for index in 65..=PUBLISHED_CHALLENGES {
        let challenge = generate(index).expect("foundry challenge generates");
        assert_eq!(challenge.family, "foundry");
        assert_eq!(challenge.editable, vec![EDITABLE_BUILDER]);
        assert_eq!(challenge.witness, "foundry_builder");
        for case in challenge.train.iter().chain(challenge.eval.iter()) {
            let witnessed =
                fixtures::replace_program(case, EDITABLE_BUILDER, fixtures::foundry_builder());
            let result = platonik_core::run(&witnessed).expect("case runs");
            assert!(
                result.outcome.passed,
                "the builder witness must pass every case of challenge-{index:04}"
            );
        }
    }
}

/// A builder that spends a unit on a declared decoy blueprint can no longer
/// field both runners: with a two-unit stock the second runner is impossible.
/// Grafted into a decoy case, the wrong-blueprint policy fails on its own.
#[test]
fn foundry_decoy_spend_cannot_raise_both_runners() {
    for index in 65..=PUBLISHED_CHALLENGES {
        let challenge = generate(index).expect("foundry challenge generates");
        for case in challenge.train.iter().chain(challenge.eval.iter()) {
            let spec = case.construction.as_ref().unwrap();
            if spec.blueprints.len() < 3 || spec.stocks[0].units.len() > 2 {
                continue;
            }
            let decoy = spec
                .blueprints
                .iter()
                .map(|blueprint| blueprint.id)
                .find(|id| ![fixtures::FOUNDRY_RUNNER_A, fixtures::FOUNDRY_RUNNER_B].contains(id))
                .expect("three-blueprint cases carry a decoy");
            let mut mistaken = fixtures::foundry_builder();
            // A greedy first rule always starts the decoy before the real
            // runners get their ordered turn.
            mistaken.rules.insert(
                0,
                Rule {
                    when: vec![
                        Condition::AssemblyStage {
                            blueprint: decoy,
                            stage: AssemblyStage::Absent,
                        },
                        Condition::HasMaterial { value: true },
                    ],
                    action: Action::Build { blueprint: decoy },
                    remember: None,
                },
            );
            mistaken.rules.insert(
                0,
                Rule {
                    when: vec![
                        Condition::AssemblyStage {
                            blueprint: decoy,
                            stage: AssemblyStage::Absent,
                        },
                        Condition::HasMaterial { value: false },
                    ],
                    action: Action::GatherMaterial {
                        stock: fixtures::FOUNDRY_STOCK,
                    },
                    remember: None,
                },
            );
            let grafted = fixtures::replace_program(case, EDITABLE_BUILDER, mistaken);
            let result = platonik_core::run(&grafted).expect("case runs");
            assert!(
                !result.outcome.passed,
                "spending the two-unit stock on the decoy must fail challenge-{index:04}"
            );
            return;
        }
    }
    panic!("no two-unit decoy case found in the published foundry window");
}

#[test]
fn eval_cases_differ_from_train_cases() {
    let challenge = generate(7).unwrap();
    let train_walls: Vec<_> = challenge.train.iter().map(|case| &case.walls).collect();
    for case in &challenge.eval {
        assert!(
            !train_walls.contains(&&case.walls),
            "eval layouts must not duplicate a training layout"
        );
    }
}

#[test]
fn witness_passes_and_idle_fails_on_eval_cases() {
    let challenge = generate(1).unwrap();
    let passing = evaluate(
        &challenge,
        &submission(
            &challenge.id,
            fixtures::resilient_courier(),
            "witness-reference",
        ),
    )
    .unwrap();
    assert!(passing.passed);
    assert_eq!(passing.cases_passed, EVAL_CASES as u32);
    let idle = evaluate(
        &challenge,
        &submission(&challenge.id, fixtures::idle_program(), "idle-control"),
    )
    .unwrap();
    assert!(!idle.passed);
    assert_eq!(idle.cases_passed, 0);
    assert!(
        idle.cases
            .iter()
            .all(|case| case.status == RunStatus::Complete)
    );
}

#[test]
fn result_verification_recomputes_and_rejects_tampering() {
    let challenge = generate(3).unwrap();
    let result = evaluate(
        &challenge,
        &submission(&challenge.id, fixtures::resilient_courier(), "entrant"),
    )
    .unwrap();
    let report = verify_result(&result).expect("honest result verifies");
    assert!(report.verified && report.passed);
    let mut forged = result.clone();
    forged.total_work -= 1;
    assert!(verify_result(&forged).is_err());
    let mut inflated = result.clone();
    inflated.cases[0].work += 1;
    assert!(verify_result(&inflated).is_err());
    let mut miscounted = result.clone();
    miscounted.cases_total += 1;
    assert!(verify_result(&miscounted).is_err());
    let mut wrong_index = result.clone();
    wrong_index.index = 4;
    assert!(verify_result(&wrong_index).is_err());
}

#[test]
fn submissions_must_match_the_declared_editable_cells() {
    let challenge = generate(2).unwrap();
    let mut wrong_challenge = submission(&challenge.id, fixtures::resilient_courier(), "a");
    wrong_challenge.challenge = "challenge-0009".into();
    assert!(evaluate(&challenge, &wrong_challenge).is_err());
    let mut extra_cell = submission(&challenge.id, fixtures::resilient_courier(), "a");
    extra_cell
        .programs
        .insert("99".into(), fixtures::idle_program());
    assert!(evaluate(&challenge, &extra_cell).is_err());
    let mut missing = submission(&challenge.id, fixtures::resilient_courier(), "a");
    missing.programs.clear();
    assert!(evaluate(&challenge, &missing).is_err());
}

#[test]
fn board_ranks_cleared_then_work_and_keeps_one_row_per_entrant() {
    let challenge = generate(1).unwrap();
    let passing = evaluate(
        &challenge,
        &submission(&challenge.id, fixtures::resilient_courier(), "solver"),
    )
    .unwrap();
    let mut slower_submission = submission(&challenge.id, guarded_courier(), "slower-copy");
    slower_submission.agent.as_mut().unwrap().tokens = Some(5000);
    let slower = evaluate(&challenge, &slower_submission).unwrap();
    assert!(slower.passed && slower.total_work > passing.total_work);
    let failing = evaluate(
        &challenge,
        &submission(&challenge.id, fixtures::idle_program(), "stuck"),
    )
    .unwrap();
    let board = board(&[slower.clone(), failing.clone(), passing.clone()]);
    let rows = &board.challenges[0].rows;
    assert_eq!(rows.len(), 3);
    assert_eq!(rows[0].entrant, "solver");
    assert_eq!(rows[1].entrant, "slower-copy");
    assert_eq!(rows[2].entrant, "stuck");
    let global = &board.global;
    assert_eq!(global[0].entrant, "solver");
    assert_eq!(global[0].cleared, 1);
    assert!(
        global
            .iter()
            .any(|row| row.entrant == "stuck" && row.cleared == 0)
    );
    assert_eq!(
        global
            .iter()
            .find(|row| row.entrant == "slower-copy")
            .unwrap()
            .tokens,
        Some(5000)
    );
}

#[test]
fn board_keeps_best_result_per_entrant_and_distinct_anonymous_names() {
    let challenge = generate(1).unwrap();
    let fast = evaluate(
        &challenge,
        &submission(&challenge.id, fixtures::resilient_courier(), "repeater"),
    )
    .unwrap();
    let slow = evaluate(
        &challenge,
        &submission(&challenge.id, guarded_courier(), "repeater"),
    )
    .unwrap();
    assert!(fast.total_work < slow.total_work);
    let deduped = board(&[slow.clone(), fast.clone()]);
    let rows = &deduped.challenges[0].rows;
    assert_eq!(rows.len(), 1, "one entrant keeps only their best result");
    assert_eq!(rows[0].total_work, fast.total_work);

    let mut anonymous_a = submission(&challenge.id, fixtures::resilient_courier(), "");
    anonymous_a.agent = None;
    let mut anonymous_b = submission(&challenge.id, fixtures::idle_program(), "");
    anonymous_b.agent = None;
    let first = evaluate(&challenge, &anonymous_a).unwrap();
    let second = evaluate(&challenge, &anonymous_b).unwrap();
    assert_ne!(first.submission_hash, second.submission_hash);
    let distinct = board(&[first, second]);
    let names: Vec<_> = distinct.challenges[0]
        .rows
        .iter()
        .map(|row| row.entrant.clone())
        .collect();
    assert_eq!(names.len(), 2);
    assert!(names.iter().all(|name| name.starts_with("anon-")));
    assert_ne!(names[0], names[1], "anonymous entrants must not collapse");
}

#[test]
fn switchboard_eval_cases_differ_from_train_and_idle_scores_zero() {
    let challenge = generate(40).unwrap();
    assert_eq!(challenge.family, "switchboard");
    for case in &challenge.eval {
        assert!(
            !challenge.train.contains(case),
            "eval layouts must not duplicate a training layout"
        );
    }
    let idle = evaluate(
        &challenge,
        &submission_on(
            &challenge.id,
            EDITABLE_KEEPER,
            fixtures::idle_program(),
            "idle-control",
        ),
    )
    .unwrap();
    assert!(!idle.passed);
    assert_eq!(idle.cases_passed, 0);
    assert!(
        idle.cases
            .iter()
            .all(|case| case.status == RunStatus::Complete)
    );
}

#[test]
fn switchboard_result_verifies_and_a_constant_router_cannot_clear_mixed_bits() {
    let challenge = generate(52).unwrap();
    let result = evaluate(
        &challenge,
        &submission_on(
            &challenge.id,
            EDITABLE_KEEPER,
            fixtures::switchboard_keeper(),
            "entrant",
        ),
    )
    .unwrap();
    assert!(result.passed);
    let report = verify_result(&result).expect("honest switchboard result verifies");
    assert!(report.verified && report.passed);

    // Routing a fixed bit is a legal program that can never clear a stream
    // carrying both values: the engine rejects each wrong-beacon route.
    for value in [false, true] {
        let constant = Program {
            rules: vec![Rule {
                when: vec![],
                action: Action::Route {
                    valve: fixtures::VALVE,
                    bit: BitSource::Constant { value },
                },
                remember: None,
            }],
        };
        let failed = evaluate(
            &challenge,
            &submission_on(&challenge.id, EDITABLE_KEEPER, constant, "constant"),
        )
        .unwrap();
        assert!(!failed.passed, "a constant {value} router must fail");
    }
}

/// Foundry negative controls on the reserved eval cases: the idle builder
/// never gathers, the crossing witness moves a body that cannot move, and
/// the switchboard witness names a valve no foundry case declares, so it is
/// rejected at submission check rather than merely failing on arrival.
#[test]
fn foundry_eval_cases_differ_from_train_and_controls_fail() {
    for index in 65..=PUBLISHED_CHALLENGES {
        let challenge = generate(index).expect("foundry challenge generates");
        for case in &challenge.eval {
            assert!(
                !challenge.train.contains(case),
                "eval layouts must not duplicate a training layout"
            );
        }
        let idle = evaluate(
            &challenge,
            &submission_on(
                &challenge.id,
                EDITABLE_BUILDER,
                fixtures::idle_program(),
                "idle-control",
            ),
        )
        .unwrap();
        assert!(!idle.passed);
        assert_eq!(idle.cases_passed, 0);
        assert!(
            idle.cases
                .iter()
                .all(|case| case.status == RunStatus::Complete)
        );
        let resilient = evaluate(
            &challenge,
            &submission_on(
                &challenge.id,
                EDITABLE_BUILDER,
                fixtures::resilient_courier(),
                "crossing-control",
            ),
        )
        .unwrap();
        assert!(!resilient.passed);
        assert_eq!(resilient.cases_passed, 0);
        let keeper = evaluate(
            &challenge,
            &submission_on(
                &challenge.id,
                EDITABLE_BUILDER,
                fixtures::switchboard_keeper(),
                "switchboard-control",
            ),
        );
        assert!(
            keeper.is_err() || !keeper.unwrap().passed,
            "the keeper cannot clear a foundry challenge"
        );
    }
}

#[test]
fn reference_policies_are_family_scoped() {
    let crossing = generate(4).unwrap();
    let switchboard = generate(40).unwrap();
    let foundry = generate(70).unwrap();
    assert!(reference_submission(&switchboard, "keeper").is_ok());
    // The crossing witness is a legal switchboard submission that fails on
    // arrival: it cannot read reports or work a valve.
    let misplaced = reference_submission(&switchboard, "resilient").unwrap();
    assert!(
        misplaced
            .programs
            .contains_key(&EDITABLE_KEEPER.to_string())
    );
    let control = evaluate(&switchboard, &misplaced).unwrap();
    assert!(!control.passed);
    // The builder witness clears its own family; the same crossing control
    // grafted into the immobile builder cell fails there too.
    assert!(reference_submission(&foundry, "builder").is_ok());
    let stranded = reference_submission(&foundry, "resilient").unwrap();
    assert!(
        stranded
            .programs
            .contains_key(&EDITABLE_BUILDER.to_string())
    );
    let control = evaluate(&foundry, &stranded).unwrap();
    assert!(!control.passed);
    // A keeper program names a valve no crossing or foundry case has: asking
    // for it on the wrong family is a clear error, and so is an unknown name
    // anywhere.
    assert!(reference_submission(&crossing, "keeper").is_err());
    assert!(reference_submission(&foundry, "keeper").is_err());
    assert!(reference_submission(&crossing, "builder").is_err());
    assert!(reference_submission(&foundry, "compact").is_err());
    assert!(reference_submission(&switchboard, "compact").is_err());
    assert!(reference_submission(&crossing, "unknown").is_err());
    assert!(reference_submission(&switchboard, "unknown").is_err());
    assert!(reference_submission(&foundry, "unknown").is_err());
}

#[test]
fn self_reported_token_totals_cannot_overflow_the_rollup() {
    let challenge = generate(1).unwrap();
    let mut huge = submission(&challenge.id, fixtures::idle_program(), "whale");
    huge.agent.as_mut().unwrap().tokens = Some(u64::MAX);
    let one = evaluate(&challenge, &huge).unwrap();
    let two = evaluate(&challenge, &huge).unwrap();
    let board = board(&[one, two]);
    let row = board
        .global
        .iter()
        .find(|row| row.entrant == "whale")
        .unwrap();
    assert_eq!(row.tokens, Some(u64::MAX));
}
