use platonik_core::{
    check,
    continuation::{self, Advance},
    model::*,
    port_commitments::{self, Phase},
    port_fixtures,
};

#[test]
fn custody_acknowledgment_and_service_are_separate_checked_obligations() {
    struct ExecutionCount;
    impl Drop for ExecutionCount {
        fn drop(&mut self) {
            eprintln!(
                "ports-focused-engine-executions={}",
                platonik_core::sim::execution_count()
            );
        }
    }
    let _execution_count = ExecutionCount;
    let world = port_fixtures::experiment(port_fixtures::case_ids()[0]).unwrap();
    let receipt = check::make_receipt(&world).unwrap();
    let grade = port_commitments::grade_receipt(&receipt).unwrap();
    assert!(grade.commitments_passed, "{grade:#?}");
    assert_eq!(grade.phase, Phase::Complete);
    assert_eq!(grade.commitments.len(), 2);
    for lane in &grade.commitments {
        assert!(lane.requested.as_ref().unwrap().tick < lane.picked_up.unwrap());
        assert!(lane.picked_up.unwrap() < lane.accepted.unwrap());
        assert!(lane.accepted.unwrap() < lane.acknowledged.as_ref().unwrap().tick);
        assert!(lane.serviced.unwrap() >= lane.accepted.unwrap());
        assert!(lane.spare_preserved);
    }

    for tick in [0, 1, 12, 48, 127] {
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
        let prefix = port_commitments::grade(&world, &Advance::Paused(checkpoint)).unwrap();
        assert_eq!(prefix.phase, Phase::InProgress);
        assert!(!prefix.commitments_passed && !prefix.service_passed);
        for lane in &prefix.commitments {
            assert!(
                lane.requested
                    .as_ref()
                    .is_none_or(|moment| moment.tick <= tick)
            );
            assert!(lane.accepted.is_none_or(|moment| moment <= tick));
            assert!(
                lane.acknowledged
                    .as_ref()
                    .is_none_or(|moment| moment.tick <= tick)
            );
        }
    }

    // A lost return channel does not undo a physical handoff. It prevents the
    // requester from knowing it happened; the grade preserves that distinction.
    let mut no_ack = world.clone();
    for lane in port_fixtures::LANES {
        for link in &mut no_ack.links {
            if lane.ack_links.contains(&link.id) || link.id == lane.duplicate_ack {
                link.enabled = false;
            }
        }
        no_ack.events.retain(|event| {
            !matches!(event.event, EventKind::LinkEnabled { id, .. }
            if lane.ack_links.contains(&id) || id == lane.duplicate_ack)
        });
    }
    let lost = port_commitments::grade_receipt(&check::make_receipt(&no_ack).unwrap()).unwrap();
    assert!(
        lost.custody_passed && lost.service_passed && lost.safety_passed,
        "{lost:#?}"
    );
    assert!(!lost.acknowledgments_passed && !lost.commitments_passed);

    // A matching bit is not evidence for the required parcel. Keep the spare
    // available so ordinary quota success cannot hide a substituted identity.
    let mut substitute = world.clone();
    for lane in port_fixtures::LANES {
        substitute
            .sources
            .iter_mut()
            .find(|source| source.id == lane.source)
            .unwrap()
            .sparks
            .retain(|spark| spark.id != lane.parcel);
    }
    let substituted =
        port_commitments::grade_receipt(&check::make_receipt(&substitute).unwrap()).unwrap();
    assert!(substituted.service_passed);
    assert!(
        !substituted.custody_passed
            && !substituted.safety_passed
            && !substituted.commitments_passed
    );

    // Sending before Drop, even into a disabled link, is an attempted false
    // custody claim. The remaining normal program may still fulfill the task.
    let mut early = world.clone();
    for lane in port_fixtures::LANES {
        let courier = early
            .cells
            .iter_mut()
            .find(|cell| cell.id == lane.courier)
            .unwrap();
        courier.program.rules.insert(
            0,
            Rule {
                when: vec![Condition::Memory { slot: 3, value: 0 }],
                action: Action::Send {
                    port: 0,
                    bit: BitSource::Constant { value: false },
                },
                remember: Some(MemoryWrite { slot: 3, value: 1 }),
            },
        );
    }
    let premature = port_commitments::grade_receipt(&check::make_receipt(&early).unwrap()).unwrap();
    assert!(!premature.safety_passed && !premature.commitments_passed);

    // Successful initial milestones cannot admit a later failed service horizon.
    let mut starved = world.clone();
    for beacon in &mut starved.beacons {
        beacon.initial_charge = 2;
        beacon.drain_every = 1;
        beacon.drain_amount = 1;
    }
    let exhausted =
        port_commitments::grade_receipt(&check::make_receipt(&starved).unwrap()).unwrap();
    assert!(!exhausted.service_passed && !exhausted.commitments_passed);

    let mut forged = receipt.clone();
    forged.result.frames.last_mut().unwrap().costs.actions += 1;
    forged.result_hash = check::artifact_hash(&forged.result).unwrap();
    assert!(port_commitments::grade_receipt(&forged).is_err());
}
