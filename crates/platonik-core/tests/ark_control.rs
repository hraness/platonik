use platonik_core::{
    ark_control::{self, Phase},
    ark_fixtures, check,
    continuation::{self, Advance},
    model::*,
};

#[test]
fn control_requires_the_complete_arithmetic_retention_and_physical_contract() {
    let world = ark_fixtures::experiment("ark-reserve-16").unwrap();
    let receipt = check::make_receipt(&world).unwrap();
    let grade = ark_control::grade_receipt(&receipt).unwrap();
    assert!(grade.control_passed);
    assert_eq!(grade.phase, Phase::Complete);
    assert_eq!(grade.observed_sum, Some(16));
    assert_eq!(
        grade
            .outputs
            .iter()
            .map(|output| output.bit)
            .collect::<Vec<_>>(),
        [false, false, false, false, true]
    );
    assert!(grade.retained);
    assert!(grade.selected.as_ref().unwrap().tick < 48);
    assert_eq!(grade.decision.as_ref().unwrap().tick, 52);
    assert!(grade.decision.as_ref().unwrap().delivered);

    // Replayed prefixes may expose the arithmetic and the decision without
    // promising that later service will finish successfully.
    for tick in [0, 8, 41, 48, 52, 127] {
        let frames: Vec<_> = receipt
            .result
            .frames
            .iter()
            .filter(|frame| frame.tick <= tick)
            .cloned()
            .collect();
        let checkpoint = continuation::Checkpoint {
            schema: continuation::CHECKPOINT_SCHEMA.into(),
            experiment_hash: receipt.experiment_hash.clone(),
            prefix_hash: check::artifact_hash(&frames).unwrap(),
            experiment: world.clone(),
            frames,
        };
        let prefix = ark_control::grade(&world, &Advance::Paused(checkpoint)).unwrap();
        assert_eq!(prefix.phase, Phase::InProgress);
        assert!(!prefix.control_passed);
        assert!(!prefix.service_passed);
        assert!(prefix.outputs.iter().all(|output| output.tick <= tick));
        assert!(
            prefix
                .selected
                .as_ref()
                .is_none_or(|selected| selected.tick <= tick)
        );
        assert!(
            prefix
                .decision
                .as_ref()
                .is_none_or(|decision| decision.tick <= tick)
        );
    }

    let mut corrupted = receipt.clone();
    corrupted.result.frames.last_mut().unwrap().costs.actions += 1;
    corrupted.result_hash = check::artifact_hash(&corrupted.result).unwrap();
    assert!(ark_control::grade_receipt(&corrupted).is_err());

    // Correct service alone must not admit an answer-bearing payload channel.
    let mut leak = world.clone();
    leak.links.push(Link {
        id: 48,
        from: Endpoint::Depot { id: 12 },
        to_cell: 11,
        to_port: 1,
        delay: 1,
        enabled: true,
    });
    let leaked = ark_control::grade_receipt(&check::make_receipt(&leak).unwrap()).unwrap();
    assert!(leaked.arithmetic_passed && leaked.service_passed);
    assert!(!leaked.control_passed);

    // The exclusion covers declared future wiring too. Even an unbuilt,
    // initially disabled channel changes the admitted information boundary.
    let mut future_leak = world.clone();
    future_leak
        .walls
        .retain(|point| *point != Point { x: 7, y: 5 });
    future_leak.construction = Some(ConstructionSpec {
        stocks: vec![],
        blueprints: vec![Blueprint {
            id: 50,
            body: BlueprintBody {
                cell: Cell {
                    id: 14,
                    position: Point { x: 7, y: 5 },
                    heading: Direction::North,
                    mobile: false,
                    memory: [0; 4],
                    program: Program {
                        rules: vec![Rule {
                            when: vec![],
                            action: Action::Wait,
                            remember: None,
                        }],
                    },
                },
                links: vec![Link {
                    id: 48,
                    from: Endpoint::Depot { id: 12 },
                    to_cell: 14,
                    to_port: 0,
                    delay: 1,
                    enabled: false,
                }],
            },
        }],
    });
    let future = ark_control::grade_receipt(&check::make_receipt(&future_leak).unwrap()).unwrap();
    assert!(future.arithmetic_passed && future.service_passed);
    assert!(!future.control_passed);

    // A longer decision window is another task, even when the same crew wins.
    let mut wider = world.clone();
    wider.events.retain(|event| event.tick != 53);
    let wide = ark_control::grade_receipt(&check::make_receipt(&wider).unwrap()).unwrap();
    assert!(wide.arithmetic_passed && wide.service_passed);
    assert!(!wide.control_passed);

    // Preserve surplus emissions in failed grades instead of truncating them
    // into a five-bit result that could appear to pass.
    let mut extras = world.clone();
    extras
        .cells
        .iter_mut()
        .find(|cell| cell.id == 10)
        .unwrap()
        .program
        .rules[0]
        .action = Action::Send {
        port: 0,
        bit: BitSource::Constant { value: false },
    };
    let surplus = ark_control::grade_receipt(&check::make_receipt(&extras).unwrap()).unwrap();
    assert!(surplus.outputs.len() > 5);
    assert_eq!(surplus.observed_sum, None);
    assert!(!surplus.arithmetic_passed && !surplus.control_passed);

    let mut late_failure = world;
    late_failure.beacons[0].drain_every = 128;
    late_failure.beacons[0].drain_amount = 1000;
    let failed = ark_control::grade_receipt(&check::make_receipt(&late_failure).unwrap()).unwrap();
    assert!(failed.arithmetic_passed && failed.retained);
    assert!(failed.decision.unwrap().delivered);
    assert_eq!(failed.phase, Phase::Failed);
    assert!(!failed.service_passed && !failed.control_passed);
}
