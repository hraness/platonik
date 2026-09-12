use platonik_core::{
    answer_fixtures as answer, check, construction, construction_fixtures, model::*, sim,
    validate_experiment,
};
use serde_json::json;
use std::{collections::BTreeSet, fs, path::PathBuf};

fn wait() -> Program {
    Program {
        rules: vec![Rule {
            when: vec![],
            action: Action::Wait,
            remember: None,
        }],
    }
}

#[test]
fn supplied_worlds_preserve_the_inherited_crew_and_finite_local_geometry() {
    assert_eq!(answer::case_ids().len(), 8);
    assert_eq!(answer::training_ids(), &answer::case_ids()[..4]);
    assert_eq!(answer::transfer_ids(), &answer::case_ids()[4..]);
    assert!(answer::experiment("answer-unknown").is_err());
    for id in answer::case_ids() {
        let world = answer::experiment(id).unwrap();
        validate_experiment(&world).unwrap();
        let inherited =
            construction_fixtures::experiment(&id.replacen("answer-", "construction-", 1)).unwrap();
        assert_eq!(world.cells.len(), 5);
        assert_eq!(world.ticks, 128);
        assert_eq!(world.fuel, 40_000);
        assert_eq!(world.activation_fuel, 128);
        let spec = world.construction.as_ref().unwrap();
        assert_eq!(spec.blueprints.len(), 2);
        assert_eq!(world.cells.len() + spec.blueprints.len(), 7);
        assert_eq!(spec.stocks.len(), 1);
        assert_eq!(
            spec.stocks[0].units,
            vec![answer::KEEPER_MATERIAL, answer::REPLY_MATERIAL]
        );
        assert_eq!(
            world.links.len()
                + spec
                    .blueprints
                    .iter()
                    .map(|b| b.body.links.len())
                    .sum::<usize>(),
            4
        );
        assert_eq!(
            spec.blueprints[0],
            inherited.construction.as_ref().unwrap().blueprints[0]
        );
        for blueprint in &spec.blueprints {
            assert!(construction::payload(blueprint).unwrap().len() <= MAX_BLUEPRINT_BYTES);
            let builder = world
                .cells
                .iter()
                .find(|cell| cell.id == answer::BUILDER)
                .unwrap();
            assert_eq!(builder.position.distance(blueprint.body.cell.position), 1);
        }
        let removed: BTreeSet<_> = inherited
            .walls
            .iter()
            .filter(|p| !world.walls.contains(p))
            .map(|p| (p.x, p.y))
            .collect();
        let expected = [
            spec.blueprints[1].body.cell.position,
            world
                .cells
                .iter()
                .find(|cell| cell.id == answer::RECEIVER)
                .unwrap()
                .position,
        ]
        .into_iter()
        .map(|p| (p.x, p.y))
        .collect::<BTreeSet<_>>();
        assert_eq!(removed, expected);
        assert!(world.walls.iter().all(|p| inherited.walls.contains(p)));
        let mut normalized = world.clone();
        normalized.walls = inherited.walls.clone();
        normalized.cells.retain(|cell| cell.id != answer::RECEIVER);
        normalized
            .cells
            .iter_mut()
            .find(|cell| cell.id == answer::BUILDER)
            .unwrap()
            .program = construction_fixtures::builder_program();
        normalized.construction.as_mut().unwrap().stocks[0]
            .units
            .pop();
        normalized.construction.as_mut().unwrap().blueprints.pop();
        assert_eq!(
            normalized, inherited,
            "Only the declared additions change {id}"
        );
    }
}

fn answer_tick(receipt: &check::Receipt) -> Option<u32> {
    let final_spark = receipt.experiment.sources[0].sparks.last()?;
    let delivery = receipt
        .result
        .final_state
        .delivered
        .iter()
        .find(|entry| entry.spark == *final_spark)?;
    receipt.result.frames.iter().find_map(|frame| {
        (frame.tick > delivery.tick
            && frame.signals.iter().any(|event| {
                event.outcome == "consumed"
                    && event.signal.link == answer::RETURN_LINK
                    && event.signal.from
                        == (Endpoint::Cell {
                            id: answer::REPLY,
                            port: answer::RETURN_PORT,
                        })
                    && event.signal.to_cell == answer::RECEIVER
                    && event.signal.to_port == answer::RETURN_PORT
                    && event.signal.receipt_spark == Some(final_spark.id)
                    && event.signal.bit == final_spark.bit
            }))
        .then_some(frame.tick)
    })
}

// Eight reference cases and four fixed negative controls: exactly twelve
// logical attempts and twenty-four actual executions. Optional output captures
// every attempt before assertions; it is not a search or a hidden extra trial.
#[test]
fn bounded_reference_qualification_and_causal_controls() {
    assert_eq!(sim::execution_count(), 0);
    let output = std::env::var_os("PLATONIK_ANSWER_QUALIFICATION_DIR").map(PathBuf::from);
    if let Some(output) = &output {
        fs::create_dir_all(output).unwrap();
    }
    let mut attempts: Vec<_> = answer::case_ids()
        .iter()
        .map(|id| {
            (
                (*id).to_string(),
                answer::experiment(id).unwrap(),
                true,
                true,
            )
        })
        .collect();
    for control in [
        "no-reply-material",
        "return-disabled",
        "blind-reply",
        "idle-courier",
    ] {
        let mut world = answer::experiment("answer-one").unwrap();
        match control {
            "no-reply-material" => {
                world.construction.as_mut().unwrap().stocks[0].units.pop();
            }
            "return-disabled" => {
                world.construction.as_mut().unwrap().blueprints[1]
                    .body
                    .links
                    .iter_mut()
                    .find(|link| link.id == answer::RETURN_LINK)
                    .unwrap()
                    .enabled = false;
            }
            "blind-reply" => {
                world.construction.as_mut().unwrap().blueprints[1]
                    .body
                    .cell
                    .program = Program {
                    rules: vec![Rule {
                        when: vec![],
                        action: Action::Send {
                            port: answer::RETURN_PORT,
                            bit: BitSource::Constant {
                                value: world.sources[0].sparks.last().unwrap().bit,
                            },
                        },
                        remember: None,
                    }],
                };
            }
            "idle-courier" => {
                world
                    .cells
                    .iter_mut()
                    .find(|cell| cell.id == answer::COURIER)
                    .unwrap()
                    .program = wait()
            }
            _ => unreachable!(),
        }
        attempts.push((
            format!("control-{control}"),
            world,
            false,
            control != "idle-courier",
        ));
    }
    assert_eq!(attempts.len(), 12);
    let mut failures = Vec::new();
    for (index, (id, world, expected_answer, expected_service)) in attempts.into_iter().enumerate()
    {
        let prefix = format!("{:02}-{id}", index + 1);
        if let Some(output) = &output {
            fs::write(
                output.join(format!("{prefix}.experiment.json")),
                serde_json::to_vec_pretty(&world).unwrap(),
            )
            .unwrap();
        }
        let before = sim::execution_count();
        let made = check::make_receipt(&world);
        let verification = made.as_ref().ok().map(check::verify_receipt);
        let found_tick = made.as_ref().ok().and_then(answer_tick);
        let service = made.as_ref().ok().is_some_and(|r| r.passed());
        let complete = made.as_ref().ok().is_some_and(|r| {
            r.result.status == RunStatus::Complete
                && r.result.ticks_completed == 128
                && r.result.frames.iter().all(|f| f.complete)
        });
        let verified = matches!(&verification, Some(Ok(value)) if value.verified);
        let journey = if verified {
            made.as_ref().ok().map(|receipt| {
                platonik_core::first_answer::grade_verified(
                    &world,
                    &platonik_core::continuation::Advance::Finished(receipt.result.clone()),
                )
            })
        } else {
            None
        };
        let graded = matches!(&journey, Some(Ok(value)) if value.answered == expected_answer);
        let born = made.as_ref().ok().map(|r| {
            r.result
                .final_state
                .construction
                .as_ref()
                .unwrap()
                .births
                .iter()
                .map(|b| json!({"cell":b.body.cell.id,"tick":b.tick,"material":b.material}))
                .collect::<Vec<_>>()
        });
        let good = complete
            && verified
            && graded
            && service == expected_service
            && found_tick.is_some() == expected_answer;
        let record = json!({"schema":"platonik-answer-fixture-attempt-v1","attempt":index+1,"id":id,"input_hash":check::artifact_hash(&world).unwrap(),"result_hash":made.as_ref().ok().map(|r|&r.result_hash),"status":made.as_ref().ok().map(|r|&r.result.status),"expected_answer":expected_answer,"answer_tick":found_tick,"expected_service":expected_service,"service_passed":service,"verified":verified,"journey":journey.as_ref().and_then(|j|j.as_ref().ok()),"births":born,"work":made.as_ref().ok().map(|r|r.result.costs.total()),"engine_executions":sim::execution_count()-before,"engine_executions_so_far":sim::execution_count(),"passed":good,"error":made.as_ref().err(),"verification_error":verification.as_ref().and_then(|v|v.as_ref().err()),"grading_error":journey.as_ref().and_then(|j|j.as_ref().err())});
        if let Some(output) = &output {
            if let Ok(receipt) = &made {
                fs::write(
                    output.join(format!("{prefix}.receipt.json")),
                    serde_json::to_vec_pretty(receipt).unwrap(),
                )
                .unwrap();
            }
            fs::write(
                output.join(format!("{prefix}.attempt.json")),
                serde_json::to_vec_pretty(&record).unwrap(),
            )
            .unwrap();
        }
        eprintln!("answer-qualification {record}");
        if !good {
            failures.push(id);
        }
        assert!(sim::execution_count() <= 24);
    }
    assert_eq!(sim::execution_count(), 24);
    assert!(
        failures.is_empty(),
        "Qualification failures retained: {failures:?}"
    );
}
