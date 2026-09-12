use platonik_core::{
    answer_fixtures, check,
    continuation::{self, Advance},
    first_answer::{self, MilestoneKind, Phase},
};

#[test]
fn ending_requires_the_verified_complete_world_and_preserves_prefix_progress() {
    let world = answer_fixtures::experiment("answer-one").unwrap();
    let receipt = check::make_receipt(&world).unwrap();
    let journey = first_answer::grade_receipt(&receipt).unwrap();
    assert!(journey.answered);
    assert_eq!(journey.phase, Phase::Answered);
    assert_eq!(journey.result_hash, Some(receipt.result_hash.clone()));
    assert_eq!(journey.experiment_hash, receipt.experiment_hash);
    assert_eq!(journey.milestones.len(), 4);
    let contact = journey
        .milestones
        .iter()
        .find(|milestone| milestone.kind == MilestoneKind::MatchingReply)
        .unwrap();
    let supplied = journey
        .milestones
        .iter()
        .find(|milestone| milestone.kind == MilestoneKind::CrewSupplied)
        .unwrap();
    assert!(contact.tick > supplied.tick);
    assert!(contact.tick < 128);
    assert_eq!(contact.spark, supplied.spark);

    // Prefixes are cut from the recorded complete execution and independently
    // recomputed. Even contact cannot promise later service will survive.
    for tick in [0, contact.tick - 1, contact.tick, 127] {
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
        let partial = first_answer::grade(&world, &Advance::Paused(checkpoint)).unwrap();
        assert_eq!(partial.phase, Phase::InProgress);
        assert!(!partial.answered);
        assert!(!partial.service_passed);
        assert_eq!(partial.answer, None);
        assert_eq!(partial.result_hash, None);
        assert!(
            partial
                .milestones
                .iter()
                .all(|milestone| milestone.tick <= tick)
        );
        assert_eq!(
            partial
                .milestones
                .iter()
                .any(|milestone| milestone.kind == MilestoneKind::MatchingReply),
            tick >= contact.tick
        );
    }

    let mut forged = receipt.clone();
    forged.result_hash = "sha256:wrong".into();
    assert!(first_answer::grade_receipt(&forged).is_err());
    let mut forged = receipt.clone();
    forged.result.frames.last_mut().unwrap().costs.actions += 1;
    forged.result_hash = check::artifact_hash(&forged.result).unwrap();
    assert!(first_answer::grade_receipt(&forged).is_err());

    // A valid changed world can receive contact and still fail after it. Its
    // service and ending must stay failed; receipt validity is a separate fact.
    let mut late_failure = world.clone();
    late_failure.beacons[0].drain_every = 128;
    late_failure.beacons[0].drain_amount = 1000;
    let failed = check::make_receipt(&late_failure).unwrap();
    let failure = first_answer::grade_receipt(&failed).unwrap();
    assert!(
        failure
            .milestones
            .iter()
            .any(|milestone| milestone.kind == MilestoneKind::MatchingReply)
    );
    assert_eq!(failure.phase, Phase::FinishedWithoutAnswer);
    assert!(!failure.service_passed);
    assert_eq!(failure.answer, None);
}
