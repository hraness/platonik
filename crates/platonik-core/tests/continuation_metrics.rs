//! One test in a separate integration-test process keeps the process counter
//! assertion independent of concurrent tests in other binaries.
use platonik_core::{continuation::*, fixtures, sim};

#[test]
fn metrics_count_prefix_replays_and_suffix_runs_without_charging_world_loading_twice() {
    let experiment = fixtures::experiment("opening-normal").unwrap();
    let before = sim::execution_count();
    let Advance::Paused(checkpoint) = start_until(&experiment, 0).unwrap() else {
        panic!("expected loading-only prefix");
    };
    assert_eq!(sim::execution_count() - before, 1);
    let loading = checkpoint.frames[0].costs.loading;
    let encoded = serde_json::to_string(&checkpoint).unwrap();
    let restored = parse_checkpoint(&encoded).unwrap();
    assert_eq!(sim::execution_count() - before, 1);
    verify_checkpoint(&restored).unwrap();
    assert_eq!(sim::execution_count() - before, 2);
    assert!(resume_until(&restored, 0).is_err());
    assert_eq!(sim::execution_count() - before, 2);
    let Advance::Paused(next) = resume_until(&restored, 2).unwrap() else {
        panic!("expected tick-two prefix");
    };
    assert_eq!(sim::execution_count() - before, 4);
    assert_eq!(next.frames.last().unwrap().costs.loading, loading);
    let Advance::Finished(result) = resume_until(&next, experiment.ticks).unwrap() else {
        panic!("expected complete original run");
    };
    assert_eq!(sim::execution_count() - before, 6);
    assert_eq!(result.costs.loading, loading);
    assert_eq!(result, sim::run(&experiment).unwrap());
    assert_eq!(sim::execution_count() - before, 7);
}
