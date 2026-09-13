use platonik_core::{bloom_ports_composition, check};

#[test]
fn selected_bloom_child_carries_one_lane_confirmation_provenance() {
    for id in bloom_ports_composition::case_ids() {
        let experiment = bloom_ports_composition::experiment(id).unwrap();
        let receipt = check::make_receipt(&experiment).unwrap();
        let grade = bloom_ports_composition::grade_receipt(&receipt).unwrap();
        assert!(grade.composition_passed, "{id}: {grade:?}");
        assert_eq!(grade.schema, bloom_ports_composition::SCHEMA);
        assert!(grade.confirmation.request.sent_tick < grade.confirmation.pickup);
        assert!(grade.confirmation.pickup <= grade.confirmation.accepted);
        assert!(grade.confirmation.accepted <= grade.confirmation.acknowledgment.tick);
        assert!(grade.confirmation.acknowledgment.tick <= grade.confirmation.serviced);
    }
}

#[test]
fn a_non_bloom_or_paused_prefix_cannot_enter_composition() {
    let experiment = bloom_ports_composition::experiment("bloom-left").unwrap();
    let prefix = platonik_core::continuation::start_until(&experiment, 10).unwrap();
    assert!(bloom_ports_composition::grade(&experiment, &prefix).is_err());
}
