//! Independent industry effect checker: replays the recorded gather, supply,
//! and fetch actions against the checker's own expected state. No interpreter
//! or industry executor is called here.
use super::ensure;
use crate::model::*;

fn facility_index(state: &State, position: Point) -> Result<usize, String> {
    state
        .facilities
        .iter()
        .position(|facility| facility.position == position)
        .ok_or_else(|| "A facility action occurs away from a facility.".into())
}

fn usable(kind: FacilityKind, item: ItemKind) -> bool {
    matches!(
        (kind, item),
        (
            FacilityKind::Fabricator,
            ItemKind::Material | ItemKind::Spark
        ) | (
            FacilityKind::Assembler,
            ItemKind::Material | ItemKind::Part | ItemKind::Spark
        ) | (FacilityKind::Storehouse, _)
    )
}

fn finish(facility: &mut FacilityState) {
    if facility.needed_material == 0 && facility.needed_part == 0 && facility.needed_frame == 0 {
        facility.ready = true;
    }
}

fn supply(item: ItemKind, index: usize, actor: usize, state: &mut State) -> Result<(), String> {
    let facility = &state.facilities[index];
    match item {
        ItemKind::Spark => {
            let spark = state.cells[actor].cargo.ok_or("Supply carries no spark.")?;
            ensure(
                facility.ready
                    && usable(facility.kind, ItemKind::Spark)
                    && facility.sparks.len() < FACILITY_ITEM_LIMIT,
                "A facility accepted a spark it has no room or use for.",
            )?;
            state.facilities[index].sparks.push(spark);
            state.cells[actor].cargo = None;
        }
        ItemKind::Material => {
            let material = state.cells[actor]
                .material
                .ok_or("Supply carries no material.")?;
            if facility.ready {
                ensure(
                    usable(facility.kind, ItemKind::Material)
                        && facility.materials.len() < FACILITY_ITEM_LIMIT,
                    "A facility accepted material past its buffer.",
                )?;
                state.facilities[index].materials.push(material);
            } else {
                ensure(
                    facility.needed_material > 0,
                    "A site accepted material outside its bill.",
                )?;
                let facility = &mut state.facilities[index];
                facility.needed_material -= 1;
                facility.spent_materials.push(material);
                finish(facility);
            }
            state.cells[actor].material = None;
        }
        ItemKind::Part => {
            let part = state.cells[actor].part.ok_or("Supply carries no part.")?;
            if facility.ready {
                ensure(
                    usable(facility.kind, ItemKind::Part)
                        && facility.parts.len() < FACILITY_ITEM_LIMIT,
                    "A facility accepted a part it has no room or use for.",
                )?;
                state.facilities[index].parts.push(part);
            } else {
                ensure(
                    facility.needed_part > 0,
                    "A site accepted a part outside its bill.",
                )?;
                let facility = &mut state.facilities[index];
                facility.needed_part -= 1;
                facility.spent_parts.push(part);
                finish(facility);
            }
            state.cells[actor].part = None;
        }
        ItemKind::Frame => {
            let frame = state.cells[actor].frame.ok_or("Supply carries no frame.")?;
            if facility.ready {
                ensure(
                    usable(facility.kind, ItemKind::Frame)
                        && facility.frames.len() < FACILITY_ITEM_LIMIT,
                    "A facility accepted a frame it has no room or use for.",
                )?;
                state.facilities[index].frames.push(frame);
            } else {
                ensure(
                    facility.needed_frame > 0,
                    "A site accepted a frame outside its bill.",
                )?;
                let facility = &mut state.facilities[index];
                facility.needed_frame -= 1;
                facility.spent_frames.push(frame);
                finish(facility);
            }
            state.cells[actor].frame = None;
        }
    }
    Ok(())
}

fn fetch(item: ItemKind, index: usize, actor: usize, state: &mut State) -> Result<(), String> {
    let facility = &state.facilities[index];
    ensure(facility.ready, "Fetch draws on an unfinished site.")?;
    match item {
        ItemKind::Spark => {
            ensure(
                facility.kind == FacilityKind::Storehouse && !facility.sparks.is_empty(),
                "Fetch takes a spark the facility does not offer.",
            )?;
            ensure(
                state.cells[actor].cargo.is_none(),
                "Fetch overwrites carried cargo.",
            )?;
            state.cells[actor].cargo = state.facilities[index].sparks.pop();
        }
        ItemKind::Material => {
            ensure(
                matches!(
                    facility.kind,
                    FacilityKind::Storehouse | FacilityKind::Miner
                ) && !facility.materials.is_empty(),
                "Fetch takes material the facility does not offer.",
            )?;
            ensure(
                state.cells[actor].material.is_none(),
                "Fetch overwrites carried material.",
            )?;
            state.cells[actor].material = state.facilities[index].materials.pop();
        }
        ItemKind::Part => {
            ensure(
                matches!(
                    facility.kind,
                    FacilityKind::Storehouse | FacilityKind::Fabricator
                ) && !facility.parts.is_empty(),
                "Fetch takes a part the facility does not offer.",
            )?;
            ensure(
                state.cells[actor].part.is_none(),
                "Fetch overwrites a carried part.",
            )?;
            state.cells[actor].part = state.facilities[index].parts.pop();
        }
        ItemKind::Frame => {
            ensure(
                matches!(
                    facility.kind,
                    FacilityKind::Storehouse | FacilityKind::Assembler
                ) && !facility.frames.is_empty(),
                "Fetch takes a frame the facility does not offer.",
            )?;
            ensure(
                state.cells[actor].frame.is_none(),
                "Fetch overwrites a carried frame.",
            )?;
            state.cells[actor].frame = state.facilities[index].frames.pop();
        }
    }
    Ok(())
}

/// Apply only the successful action recorded in the trace, re-deriving the
/// same transition the simulator's industry executor reports.
pub(super) fn apply(
    experiment: &Experiment,
    state: &mut State,
    index: usize,
    action: &Action,
) -> Result<(), String> {
    ensure(
        experiment.version >= INDUSTRY_VERSION,
        "An industry action appears before habitat-v5.",
    )?;
    let position = state.cells[index].position;
    if matches!(action, Action::Gather) {
        ensure(
            state.cells[index].material.is_none(),
            "Gather overwrites carried material.",
        )?;
        let declared = experiment
            .construction
            .as_ref()
            .and_then(|spec| spec.stocks.iter().find(|stock| stock.position == position))
            .ok_or("Gather occurs away from a material stock.")?;
        let stock = state
            .construction
            .as_mut()
            .ok_or("Gather outside construction.")?
            .stocks
            .iter_mut()
            .find(|stock| stock.id == declared.id)
            .ok_or("Missing material stock.")?;
        ensure(
            !stock.units.is_empty(),
            "Gather creates material from an empty stock.",
        )?;
        state.cells[index].material = Some(stock.units.remove(0));
        return Ok(());
    }
    let facility = facility_index(state, position)?;
    match action {
        Action::Supply { item } => supply(*item, facility, index, state),
        Action::Fetch { item } => fetch(*item, facility, index, state),
        _ => unreachable!(),
    }
}
