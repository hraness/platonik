//! Read-only observations of settled industry state. These diagnostics never
//! become part of a world, engine frame, or historical receipt identity.
use crate::industry;
use crate::model::*;
use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Construction,
    Working,
    WaitingInputs,
    OutputFull,
    Exhausted,
    Ready,
    Storage,
    WaitingTransfer,
    MintLimit,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ItemQuantity {
    pub item: ItemKind,
    pub quantity: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Recipe {
    pub inputs: Vec<ItemQuantity>,
    pub output: ItemQuantity,
    /// Processing countdown after inputs are committed, not total cadence.
    pub ticks: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct Transfer {
    pub source: u16,
    pub destination: u16,
    pub item: ItemKind,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct FacilityDiagnostic {
    pub id: u16,
    pub status: Status,
    /// Current countdown, not a promised completion time. Drills and cranes
    /// recheck eligibility when their clocks expire and may complete no work.
    pub remaining_ticks: u32,
    /// Remaining construction bill, or inputs missing from an idle recipe.
    /// Running recipes have already committed their inputs.
    pub missing_inputs: Vec<ItemQuantity>,
    pub recipe: Option<Recipe>,
    /// The transfer eligible in this snapshot. Earlier actors or facilities
    /// may change this candidate before the crane next runs.
    pub transfer: Option<Transfer>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct IndustryFrame {
    pub tick: u32,
    pub facilities: Vec<FacilityDiagnostic>,
}

fn amount(item: ItemKind, quantity: u32) -> ItemQuantity {
    ItemQuantity { item, quantity }
}

fn recipe(kind: FacilityKind) -> Option<Recipe> {
    match kind {
        FacilityKind::Fabricator => Some(Recipe {
            inputs: vec![amount(ItemKind::Material, 1), amount(ItemKind::Spark, 1)],
            output: amount(ItemKind::Part, 1),
            ticks: FACILITY_RECIPE_TICKS,
        }),
        FacilityKind::Assembler => Some(Recipe {
            inputs: vec![
                amount(ItemKind::Material, 1),
                amount(ItemKind::Part, 1),
                amount(ItemKind::Spark, 1),
            ],
            output: amount(ItemKind::Frame, 1),
            ticks: ASSEMBLER_RECIPE_TICKS,
        }),
        _ => None,
    }
}

fn held(facility: &FacilityState, item: ItemKind) -> usize {
    match item {
        ItemKind::Material => facility.materials.len(),
        ItemKind::Spark => facility.sparks.len(),
        ItemKind::Part => facility.parts.len(),
        ItemKind::Frame => facility.frames.len(),
    }
}

fn diagnose(
    experiment: &Experiment,
    state: &State,
    facility: &FacilityState,
) -> FacilityDiagnostic {
    let mut diagnostic = FacilityDiagnostic {
        id: facility.id,
        status: Status::Ready,
        remaining_ticks: facility.progress,
        missing_inputs: Vec::new(),
        recipe: recipe(facility.kind),
        transfer: None,
    };
    if !facility.ready {
        diagnostic.status = Status::Construction;
        diagnostic.missing_inputs = [
            amount(ItemKind::Material, u32::from(facility.needed_material)),
            amount(ItemKind::Part, u32::from(facility.needed_part)),
            amount(ItemKind::Frame, u32::from(facility.needed_frame)),
        ]
        .into_iter()
        .filter(|input| input.quantity > 0)
        .collect();
        return diagnostic;
    }
    diagnostic.status = match facility.kind {
        FacilityKind::Fabricator | FacilityKind::Assembler => {
            let recipe = diagnostic.recipe.as_ref().unwrap();
            if facility.progress > 0 {
                Status::Working
            } else {
                diagnostic.missing_inputs = recipe
                    .inputs
                    .iter()
                    .filter_map(|input| {
                        let missing = input
                            .quantity
                            .saturating_sub(held(facility, input.item) as u32);
                        (missing > 0).then(|| amount(input.item, missing))
                    })
                    .collect();
                if facility.minted >= 0xFFFF {
                    Status::MintLimit
                } else if held(facility, recipe.output.item) >= FACILITY_ITEM_LIMIT {
                    Status::OutputFull
                } else if !diagnostic.missing_inputs.is_empty() {
                    Status::WaitingInputs
                } else {
                    Status::Ready
                }
            }
        }
        FacilityKind::Miner => {
            if facility.materials.len() >= FACILITY_ITEM_LIMIT {
                Status::OutputFull
            } else if !industry::can_extract(experiment, state.construction.as_ref(), facility) {
                Status::Exhausted
            } else if facility.progress > 0 {
                Status::Working
            } else {
                Status::Ready
            }
        }
        FacilityKind::Crane => {
            diagnostic.transfer = industry::crane_move(state, facility.position).map(
                |(source, destination, item)| Transfer {
                    source: state.facilities[source].id,
                    destination: state.facilities[destination].id,
                    item,
                },
            );
            if diagnostic.transfer.is_none() {
                Status::WaitingTransfer
            } else if facility.progress > 0 {
                Status::Working
            } else {
                Status::Ready
            }
        }
        FacilityKind::Storehouse => Status::Storage,
    };
    diagnostic
}

/// Observe the exact supplied state without advancing or reserving any work.
pub fn snapshot(experiment: &Experiment, state: &State) -> Vec<FacilityDiagnostic> {
    state
        .facilities
        .iter()
        .map(|facility| diagnose(experiment, state, facility))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{check::artifact_hash, sim, world, world_fixtures};

    fn initial() -> (Experiment, State) {
        let experiment = world_fixtures::homestead();
        let report =
            world::report(&world::new("Industry".into(), experiment.clone()).unwrap()).unwrap();
        (experiment, report.state)
    }

    fn diagnostic(experiment: &Experiment, state: &State, index: usize) -> FacilityDiagnostic {
        snapshot(experiment, state).remove(index)
    }

    #[test]
    fn producer_diagnostics_follow_input_commitment_and_processing() {
        for kind in [FacilityKind::Fabricator, FacilityKind::Assembler] {
            let (experiment, mut state) = initial();
            state.facilities[0].kind = kind;
            let waiting = diagnostic(&experiment, &state, 0);
            let recipe = waiting.recipe.unwrap();
            assert_eq!(waiting.status, Status::WaitingInputs);
            assert_eq!(waiting.missing_inputs, recipe.inputs);
            state.facilities[0].materials.push(2001);
            let partial = diagnostic(&experiment, &state, 0);
            assert_eq!(partial.status, Status::WaitingInputs);
            assert!(
                !partial
                    .missing_inputs
                    .iter()
                    .any(|input| input.item == ItemKind::Material)
            );
            assert!(
                partial
                    .missing_inputs
                    .iter()
                    .any(|input| input.item == ItemKind::Spark)
            );
            state.facilities[0].sparks.push(Spark {
                id: 201,
                bit: false,
            });
            if kind == FacilityKind::Assembler {
                state.facilities[0].parts.push(3001);
            }
            assert_eq!(diagnostic(&experiment, &state, 0).status, Status::Ready);
            industry::tick(&experiment, &mut state);
            let working = diagnostic(&experiment, &state, 0);
            assert_eq!(working.status, Status::Working);
            assert_eq!(working.remaining_ticks, recipe.ticks);
            assert!(working.missing_inputs.is_empty());
            for _ in 0..recipe.ticks {
                industry::tick(&experiment, &mut state);
            }
            assert_eq!(held(&state.facilities[0], recipe.output.item), 1);
            assert_eq!(
                diagnostic(&experiment, &state, 0).status,
                Status::WaitingInputs
            );
        }
    }

    #[test]
    fn producers_report_output_and_mint_bounds() {
        for kind in [FacilityKind::Fabricator, FacilityKind::Assembler] {
            let (experiment, mut state) = initial();
            let facility = &mut state.facilities[0];
            facility.kind = kind;
            facility.materials.push(2001);
            facility.sparks.push(Spark {
                id: 201,
                bit: false,
            });
            let output = if kind == FacilityKind::Fabricator {
                &mut facility.parts
            } else {
                facility.parts.push(3001);
                &mut facility.frames
            };
            output.extend(0..FACILITY_ITEM_LIMIT as u32);
            assert_eq!(
                diagnostic(&experiment, &state, 0).status,
                Status::OutputFull
            );
            industry::tick(&experiment, &mut state);
            assert_eq!(state.facilities[0].progress, 0);
            state.facilities[0].parts.clear();
            state.facilities[0].frames.clear();
            if kind == FacilityKind::Assembler {
                state.facilities[0].parts.push(3001);
            }
            state.facilities[0].minted = 0xFFFF;
            assert_eq!(diagnostic(&experiment, &state, 0).status, Status::MintLimit);
            industry::tick(&experiment, &mut state);
            assert_eq!(state.facilities[0].progress, 0);
        }
    }

    #[test]
    fn construction_reports_only_the_outstanding_bill() {
        let (experiment, mut state) = initial();
        let mut site = industry::site(93, FacilityKind::Crane, Point { x: 12, y: 13 });
        site.needed_material = 0;
        state.facilities.push(site);
        let site = diagnostic(&experiment, &state, 3);
        assert_eq!(site.status, Status::Construction);
        assert_eq!(
            site.missing_inputs,
            vec![amount(ItemKind::Part, 1), amount(ItemKind::Frame, 1)]
        );
        assert_eq!(site.remaining_ticks, 0);
        assert!(site.transfer.is_none());
    }

    #[test]
    fn drill_reports_current_eligibility_without_promising_output() {
        let (experiment, mut state) = initial();
        let index = state
            .facilities
            .iter()
            .position(|facility| facility.kind == FacilityKind::Miner)
            .unwrap();
        assert_eq!(diagnostic(&experiment, &state, index).status, Status::Ready);
        industry::tick(&experiment, &mut state);
        assert_eq!(
            diagnostic(&experiment, &state, index).status,
            Status::Working
        );
        state.facilities[index]
            .materials
            .extend(0..FACILITY_ITEM_LIMIT as u32);
        let blocked = diagnostic(&experiment, &state, index);
        assert_eq!(blocked.status, Status::OutputFull);
        assert_eq!(blocked.remaining_ticks, MINER_PERIOD);
        state.facilities[index].materials.clear();
        for stock in &mut state.construction.as_mut().unwrap().stocks {
            stock.units.clear();
        }
        let exhausted = diagnostic(&experiment, &state, index);
        assert_eq!(exhausted.status, Status::Exhausted);
        assert_eq!(exhausted.remaining_ticks, MINER_PERIOD);
        for _ in 0..MINER_PERIOD {
            industry::tick(&experiment, &mut state);
        }
        assert!(state.facilities[index].materials.is_empty());
        assert_eq!(state.facilities[index].minted, 0);
    }

    #[test]
    fn crane_reports_authoritative_direction_priority_and_changed_eligibility() {
        let (experiment, mut state) = initial();
        state.facilities = [
            (92, FacilityKind::Storehouse, 12),
            (91, FacilityKind::Crane, 11),
            (90, FacilityKind::Storehouse, 10),
        ]
        .into_iter()
        .map(|(id, kind, x)| {
            let mut facility = industry::site(id, kind, Point { x, y: 5 });
            facility.ready = true;
            facility.needed_material = 0;
            facility.needed_part = 0;
            facility.needed_frame = 0;
            facility
        })
        .collect();
        state.facilities[2].materials.push(2001);
        state.facilities[2].parts.push(3001);
        let ready = diagnostic(&experiment, &state, 1);
        assert_eq!(ready.status, Status::Ready);
        assert_eq!(
            ready.transfer,
            Some(Transfer {
                source: 90,
                destination: 92,
                item: ItemKind::Part
            })
        );
        industry::tick(&experiment, &mut state);
        assert_eq!(diagnostic(&experiment, &state, 1).status, Status::Working);
        state.facilities[2].materials.clear();
        state.facilities[2].parts.clear();
        // A higher-id source cannot send stock back through the crane.
        state.facilities[0].parts.push(3002);
        let waiting = diagnostic(&experiment, &state, 1);
        assert_eq!(waiting.status, Status::WaitingTransfer);
        assert_eq!(waiting.remaining_ticks, CRANE_PERIOD);
        assert!(waiting.transfer.is_none());
        for _ in 0..CRANE_PERIOD {
            industry::tick(&experiment, &mut state);
        }
        assert_eq!(state.facilities[1].minted, 0);
        assert_eq!(state.facilities[0].parts, vec![3002]);
    }

    #[test]
    fn reporting_preserves_world_identity_and_exact_engine_frames() {
        let origin = world::new("Industry".into(), world_fixtures::homestead()).unwrap();
        let initial = world::report(&origin).unwrap();
        let expected = sim::continue_world(
            &origin.genesis,
            &initial.state,
            &initial.costs,
            24,
            world::ADVANCE_FUEL,
        )
        .unwrap();
        let advanced = world::apply(&origin, world::Command::Advance { ticks: 24 }).unwrap();
        let before = serde_json::to_vec(&advanced).unwrap();
        let report = world::report(&advanced).unwrap();
        assert_eq!(report.world_hash, artifact_hash(&advanced).unwrap());
        assert_eq!(before, serde_json::to_vec(&advanced).unwrap());
        assert_eq!(report.recent_frames, expected.frames);
        assert_eq!(report.state, expected.final_state);
        assert_eq!(report.costs, expected.costs);
        assert_eq!(report.industry, snapshot(&report.experiment, &report.state));
        assert_eq!(report.industry_frames.len(), report.recent_frames.len());
        for (industry, frame) in report.industry_frames.iter().zip(&report.recent_frames) {
            assert_eq!(industry.tick, frame.tick);
            assert_eq!(
                industry.facilities,
                snapshot(&report.experiment, &frame.state)
            );
        }
    }

    #[test]
    fn placed_site_diagnostics_do_not_rewrite_historical_frames() {
        let origin = world::new("Industry".into(), world_fixtures::homestead()).unwrap();
        let before = world::report(&origin).unwrap();
        let placed = world::apply(
            &origin,
            world::Command::Place {
                structure: FacilityKind::Storehouse,
                position: Point { x: 12, y: 13 },
            },
        )
        .unwrap();
        let report = world::report(&placed).unwrap();
        assert_eq!(report.recent_frames, before.recent_frames);
        assert_eq!(report.industry_frames, before.industry_frames);
        assert_eq!(report.industry.len(), before.industry.len() + 1);
        assert_eq!(report.industry.last().unwrap().status, Status::Construction);
        assert_eq!(report.industry[1].status, Status::Storage);
    }
}
