use platonik_core::{
    check::{self, artifact_hash, validate_prefix},
    continuation::{
        self, Advance, Checkpoint, parse_checkpoint, resume_until, start_until, verify_checkpoint,
    },
    expedition_fixtures, fixtures,
    model::*,
    run,
};

fn short_trial() -> Experiment {
    let mut experiment = fixtures::experiment("opening-normal").unwrap();
    experiment.version = HAZARD_VERSION;
    experiment.ticks = 8;
    let edge = Edge::new(Point { x: 2, y: 2 }, Point { x: 3, y: 2 });
    experiment.events = vec![
        Event {
            tick: 3,
            event: EventKind::EdgeBlocked {
                edge,
                blocked: true,
            },
        },
        Event {
            tick: 5,
            event: EventKind::EdgeBlocked {
                edge,
                blocked: false,
            },
        },
    ];
    experiment
}

fn paused(value: Advance) -> Checkpoint {
    match value {
        Advance::Paused(checkpoint) => checkpoint,
        Advance::Finished(_) => panic!("expected a complete, unfinished prefix"),
    }
}

fn finished(value: Advance) -> RunResult {
    match value {
        Advance::Finished(result) => result,
        Advance::Paused(_) => panic!("expected the original horizon or terminal fuel failure"),
    }
}

fn same_bytes(actual: &RunResult, expected: &RunResult) {
    assert_eq!(actual, expected);
    assert_eq!(
        serde_json::to_vec(actual).unwrap(),
        serde_json::to_vec(expected).unwrap()
    );
}

fn rehash(checkpoint: &mut Checkpoint) {
    checkpoint.experiment_hash = artifact_hash(&checkpoint.experiment).unwrap();
    checkpoint.prefix_hash = artifact_hash(&checkpoint.frames).unwrap();
}

#[test]
fn every_short_cut_and_one_tick_chunks_match_uninterrupted_bytes() {
    let experiment = short_trial();
    let cold = run(&experiment).unwrap();
    for cut in 0..experiment.ticks {
        let checkpoint = paused(start_until(&experiment, cut).unwrap());
        assert_eq!(checkpoint.frames, cold.frames[..=cut as usize]);
        let restored = parse_checkpoint(&serde_json::to_string(&checkpoint).unwrap()).unwrap();
        assert_eq!(verify_checkpoint(&restored).unwrap().tick, cut);
        same_bytes(
            &finished(resume_until(&restored, experiment.ticks).unwrap()),
            &cold,
        );
        // Advancing a clone cannot rewrite the original checkpoint or prefix.
        assert_eq!(restored, checkpoint);
    }
    let mut checkpoint = paused(start_until(&experiment, 0).unwrap());
    for tick in 1..experiment.ticks {
        checkpoint = paused(resume_until(&checkpoint, tick).unwrap());
        assert_eq!(checkpoint.frames, cold.frames[..=tick as usize]);
    }
    same_bytes(
        &finished(resume_until(&checkpoint, experiment.ticks).unwrap()),
        &cold,
    );
    same_bytes(
        &finished(start_until(&experiment, experiment.ticks).unwrap()),
        &cold,
    );
}

#[test]
fn carried_resources_closures_and_drain_are_not_reinitialized() {
    let experiment = short_trial();
    let cold = run(&experiment).unwrap();
    let checkpoint = paused(start_until(&experiment, 3).unwrap());
    let before = checkpoint.frames.last().unwrap();
    assert!(before.state.cells[0].cargo.is_some());
    assert_eq!(before.state.closed_edges.len(), 1);
    assert_eq!(
        before.state.sources[0].sparks.len(),
        experiment.sources[0].sparks.len() - 1
    );
    let next = paused(resume_until(&checkpoint, 4).unwrap());
    assert!(next.frames[4].state.beacons[0].drained > before.state.beacons[0].drained);
    assert_eq!(
        next.frames[4].costs.loading,
        checkpoint.frames[0].costs.loading
    );
    assert_eq!(
        next.frames[4].state.next_signal,
        cold.frames[4].state.next_signal
    );
    same_bytes(
        &finished(resume_until(&next, experiment.ticks).unwrap()),
        &cold,
    );
}

#[test]
fn queued_signals_inboxes_and_provenance_survive_absolute_time_cuts() {
    for id in ["ark-plan-b", "transfer-delayed-plan-b"] {
        let experiment = expedition_fixtures::experiment(id).unwrap();
        let cold = run(&experiment).unwrap();
        assert!(cold.outcome.passed);
        let pending_tick = cold
            .frames
            .iter()
            .find(|f| !f.state.pending.is_empty())
            .unwrap()
            .tick;
        let inbox_tick = cold
            .frames
            .iter()
            .find(|f| {
                f.state
                    .cells
                    .iter()
                    .any(|c| c.inbox.iter().any(Option::is_some))
            })
            .unwrap()
            .tick;
        let memory_tick = cold
            .frames
            .iter()
            .find(|f| {
                f.state
                    .cells
                    .iter()
                    .any(|c| c.id == 3 && c.evidence[0].is_some())
            })
            .unwrap()
            .tick;
        for cut in [pending_tick, inbox_tick, memory_tick, 47, 48, 51, 52, 54] {
            let checkpoint = paused(start_until(&experiment, cut).unwrap());
            let before = checkpoint.frames.last().unwrap().clone();
            let resumed = finished(resume_until(&checkpoint, experiment.ticks).unwrap());
            same_bytes(&resumed, &cold);
            assert_eq!(checkpoint.frames.last().unwrap(), &before);
        }
        let at48 = &cold.frames[48].state;
        assert!(
            !at48
                .links
                .iter()
                .find(|link| link.id == 41)
                .unwrap()
                .enabled
        );
        let controller = at48.cells.iter().find(|cell| cell.id == 3).unwrap();
        assert_eq!(controller.memory[0], 1);
        assert!(controller.evidence[0].is_some());
        assert_eq!(
            cold.final_state
                .delivered
                .iter()
                .map(|d| d.tick)
                .collect::<Vec<_>>(),
            [52, 53, 54, 55]
        );
    }
}

#[test]
fn fuel_failure_remains_terminal_and_never_refills_during_resume() {
    let reference = short_trial();
    let full = run(&reference).unwrap();
    let loading = full.frames[0].costs.total();
    let later = full.frames[3].costs.total();
    let mut saw_loading_failure = false;
    let mut saw_partial_tick = false;
    for fuel in [
        0,
        1,
        loading - 2,
        loading,
        loading + 1,
        later - 2,
        later,
        later + 1,
    ] {
        let mut experiment = reference.clone();
        experiment.fuel = fuel;
        let cold = run(&experiment).unwrap();
        assert_eq!(cold.status, RunStatus::FuelExhausted);
        assert!(!cold.outcome.passed);
        assert_eq!(cold.costs.total(), fuel);
        let result = match start_until(&experiment, 0).unwrap() {
            Advance::Finished(result) => {
                saw_loading_failure = true;
                result
            }
            Advance::Paused(checkpoint) => {
                let result = finished(resume_until(&checkpoint, experiment.ticks).unwrap());
                saw_partial_tick |=
                    result.frames.len() > 1 && !result.frames.last().unwrap().complete;
                // A complete earlier tick is also a valid pause before fuel failure.
                if cold.ticks_completed > 0 {
                    let checkpoint =
                        paused(start_until(&experiment, cold.ticks_completed).unwrap());
                    same_bytes(
                        &finished(resume_until(&checkpoint, experiment.ticks).unwrap()),
                        &cold,
                    );
                }
                result
            }
        };
        same_bytes(&result, &cold);
        assert!(validate_prefix(&experiment, &result.frames).is_err());
        check::validate_result(&experiment, &result).unwrap();
    }
    assert!(saw_loading_failure && saw_partial_tick);
}

#[test]
fn prior_activation_limit_stays_failed_after_complete_tick_pause() {
    let mut experiment = short_trial();
    experiment.activation_fuel = 1;
    let cold = run(&experiment).unwrap();
    assert_eq!(cold.status, RunStatus::ActivationLimit);
    assert!(cold.frames.iter().all(|frame| frame.complete));
    for cut in 1..experiment.ticks {
        let checkpoint = paused(start_until(&experiment, cut).unwrap());
        assert!(verify_checkpoint(&checkpoint).unwrap().activation_limited);
        let result = finished(resume_until(&checkpoint, experiment.ticks).unwrap());
        assert_eq!(result.status, RunStatus::ActivationLimit);
        assert!(!result.outcome.passed);
        same_bytes(&result, &cold);
    }
    let mut exhausted = experiment.clone();
    exhausted.fuel = cold.frames[3].costs.total();
    let prefix = paused(start_until(&exhausted, 1).unwrap());
    let result = finished(resume_until(&prefix, exhausted.ticks).unwrap());
    assert_eq!(result.status, RunStatus::FuelExhausted);
    same_bytes(&result, &run(&exhausted).unwrap());
}

#[test]
fn independently_checked_prefix_rejects_resource_memory_clock_queue_and_overflow_forgery() {
    let experiment = expedition_fixtures::experiment("ark-plan-b").unwrap();
    let checkpoint = paused(start_until(&experiment, 10).unwrap());
    for attack in 0..7 {
        let mut changed = checkpoint.clone();
        let frame = changed.frames.last_mut().unwrap();
        match attack {
            0 => frame.state.cells[0].cargo = frame.state.sources[0].sparks.first().copied(),
            1 => frame.state.cells[2].memory[0] ^= 1,
            2 => frame.state.cells[2].evidence[0] = Some(999),
            3 => frame.state.tick += 1,
            4 => frame.state.next_signal = 0,
            5 => frame.costs.loading = u64::MAX,
            6 => frame.complete = false,
            _ => unreachable!(),
        }
        rehash(&mut changed);
        assert!(verify_checkpoint(&changed).is_err(), "attack {attack}");
        assert!(
            resume_until(&changed, experiment.ticks).is_err(),
            "attack {attack}"
        );
    }
    let mut pending = paused(start_until(&experiment, 8).unwrap());
    assert!(!pending.frames[8].state.pending.is_empty());
    pending.frames[8].state.pending[0].deliver_tick += 1;
    rehash(&mut pending);
    assert!(verify_checkpoint(&pending).is_err());
}

#[test]
fn replay_rejects_rehashed_monotone_costs_that_invariants_alone_cannot_authenticate() {
    let experiment = short_trial();
    let mut checkpoint = paused(start_until(&experiment, 3).unwrap());
    for frame in &mut checkpoint.frames {
        frame.costs.loading += 1;
    }
    rehash(&mut checkpoint);
    // Identity checks and local conservation do not establish exact VM work.
    validate_prefix(&experiment, &checkpoint.frames).unwrap();
    assert!(
        verify_checkpoint(&checkpoint)
            .unwrap_err()
            .contains("Fresh recomputation")
    );
}

#[test]
fn checkpoint_schema_size_bounds_and_absolute_advance_are_enforced() {
    let experiment = short_trial();
    let checkpoint = paused(start_until(&experiment, 2).unwrap());
    assert!(start_until(&experiment, experiment.ticks + 1).is_err());
    assert!(resume_until(&checkpoint, 2).is_err());
    assert!(resume_until(&checkpoint, 1).is_err());
    assert!(resume_until(&checkpoint, experiment.ticks + 1).is_err());
    let mut json = serde_json::to_value(&checkpoint).unwrap();
    json["refill_fuel"] = 100.into();
    assert!(parse_checkpoint(&json.to_string()).is_err());
    assert!(parse_checkpoint(&" ".repeat(continuation::MAX_CHECKPOINT_BYTES + 1)).is_err());
    let mut changed = checkpoint.clone();
    changed.experiment.fuel += 1;
    assert!(verify_checkpoint(&changed).is_err());
    changed = checkpoint.clone();
    changed.frames.clear();
    assert!(verify_checkpoint(&changed).is_err());
    changed = checkpoint;
    changed
        .frames
        .resize(MAX_TICKS as usize + 1, changed.frames[0].clone());
    assert!(verify_checkpoint(&changed).is_err());
}
