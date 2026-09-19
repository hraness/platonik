//! First-class facilities (habitat-v5). Declared facilities start active;
//! admitted sites finish once creatures deliver their material and part bill.
//! A fabricator burns one material token and one carried spark into a minted
//! part; a storehouse buffers items. Consumed tokens stay accountable in the
//! facility's `spent_*` lists so conservation ledgers remain exact.
use crate::construction;
use crate::model::*;
use crate::policy::Fault;
use crate::sim::{Cat, Meter};
use std::collections::BTreeSet;

/// The construction bill a placed site must receive before it turns ready.
pub fn bill(kind: FacilityKind) -> (u8, u8) {
    match kind {
        FacilityKind::Fabricator => (3, 2),
        FacilityKind::Storehouse => (2, 1),
    }
}

/// A minted part's globally unique token: facility id in the high bits, the
/// facility's own mint sequence in the low bits.
fn part_id(facility: &FacilityState, serial: u32) -> u32 {
    ((facility.id as u32) << 16) | (serial & 0xFFFF)
}

pub(crate) fn initial_state(experiment: &Experiment) -> Vec<FacilityState> {
    experiment
        .facilities
        .iter()
        .map(|decl| FacilityState {
            id: decl.id,
            kind: decl.kind,
            position: decl.position,
            ready: true,
            needed_material: 0,
            needed_part: 0,
            materials: Vec::new(),
            sparks: Vec::new(),
            parts: Vec::new(),
            spent_materials: Vec::new(),
            spent_sparks: Vec::new(),
            spent_parts: Vec::new(),
            progress: 0,
            minted: 0,
        })
        .collect()
}

/// An admitted site starts unready and holds nothing but its bill history.
pub fn site(id: u16, kind: FacilityKind, position: Point) -> FacilityState {
    let (material, part) = bill(kind);
    FacilityState {
        id,
        kind,
        position,
        ready: false,
        needed_material: material,
        needed_part: part,
        materials: Vec::new(),
        sparks: Vec::new(),
        parts: Vec::new(),
        spent_materials: Vec::new(),
        spent_sparks: Vec::new(),
        spent_parts: Vec::new(),
        progress: 0,
        minted: 0,
    }
}

/// The facility standing at a position, whether declared or admitted.
pub fn at(state: &State, position: Point) -> Option<&FacilityState> {
    state
        .facilities
        .iter()
        .find(|facility| facility.position == position)
}

fn held(facility: &FacilityState, item: ItemKind) -> &[u32] {
    match item {
        ItemKind::Material => &facility.materials,
        ItemKind::Spark => &[],
        ItemKind::Part => &facility.parts,
    }
}

fn held_len(facility: &FacilityState, item: ItemKind) -> usize {
    match item {
        ItemKind::Spark => facility.sparks.len(),
        _ => held(facility, item).len(),
    }
}

/// Whether the facility here accepts that item right now: a site accepts only
/// remaining bill items, a fabricator accepts spark/material inputs, and a
/// storehouse accepts anything it has room for.
pub fn needs(facility: &FacilityState, item: ItemKind) -> bool {
    if !facility.ready {
        return match item {
            ItemKind::Material => facility.needed_material > 0,
            ItemKind::Part => facility.needed_part > 0,
            ItemKind::Spark => false,
        };
    }
    match (facility.kind, item) {
        (FacilityKind::Fabricator, ItemKind::Part) => false,
        _ => held_len(facility, item) < FACILITY_ITEM_LIMIT,
    }
}

/// Whether the facility has a fetchable item: fabricators yield only their
/// minted parts; storehouses yield whatever they hold.
pub fn has(facility: &FacilityState, item: ItemKind) -> bool {
    if !facility.ready {
        return false;
    }
    match (facility.kind, item) {
        (FacilityKind::Fabricator, ItemKind::Part) => !facility.parts.is_empty(),
        (FacilityKind::Fabricator, _) => false,
        (FacilityKind::Storehouse, item) => held_len(facility, item) > 0,
    }
}

fn finish(facility: &mut FacilityState) {
    if facility.needed_material == 0 && facility.needed_part == 0 {
        facility.ready = true;
    }
}

fn supply(
    item: ItemKind,
    index: usize,
    actor: usize,
    state: &mut State,
    meter: &mut Meter,
) -> Result<(), Fault> {
    let facility = &state.facilities[index];
    match item {
        ItemKind::Spark => {
            let spark = state.cells[actor]
                .cargo
                .ok_or(Fault::Action("item_missing"))?;
            if !facility.ready || facility.sparks.len() >= FACILITY_ITEM_LIMIT {
                return Err(Fault::Action("facility_rejects"));
            }
            meter.charge(Cat::Transfers, 1)?;
            state.facilities[index].sparks.push(spark);
            state.cells[actor].cargo = None;
        }
        ItemKind::Material => {
            let material = state.cells[actor]
                .material
                .ok_or(Fault::Action("item_missing"))?;
            if !facility.ready {
                if facility.needed_material == 0 {
                    return Err(Fault::Action("facility_rejects"));
                }
                meter.charge(Cat::Transfers, 1)?;
                meter.charge(Cat::Construction, 1)?;
                let facility = &mut state.facilities[index];
                facility.needed_material -= 1;
                facility.spent_materials.push(material);
                finish(facility);
            } else {
                if facility.materials.len() >= FACILITY_ITEM_LIMIT {
                    return Err(Fault::Action("facility_rejects"));
                }
                meter.charge(Cat::Transfers, 1)?;
                state.facilities[index].materials.push(material);
            }
            state.cells[actor].material = None;
        }
        ItemKind::Part => {
            let part = state.cells[actor]
                .part
                .ok_or(Fault::Action("item_missing"))?;
            if !facility.ready {
                if facility.needed_part == 0 {
                    return Err(Fault::Action("facility_rejects"));
                }
                meter.charge(Cat::Transfers, 1)?;
                meter.charge(Cat::Construction, 1)?;
                let facility = &mut state.facilities[index];
                facility.needed_part -= 1;
                facility.spent_parts.push(part);
                finish(facility);
            } else {
                if facility.kind == FacilityKind::Fabricator
                    || facility.parts.len() >= FACILITY_ITEM_LIMIT
                {
                    return Err(Fault::Action("facility_rejects"));
                }
                meter.charge(Cat::Transfers, 1)?;
                state.facilities[index].parts.push(part);
            }
            state.cells[actor].part = None;
        }
    }
    Ok(())
}

fn fetch(
    item: ItemKind,
    index: usize,
    actor: usize,
    state: &mut State,
    meter: &mut Meter,
) -> Result<(), Fault> {
    let facility = &state.facilities[index];
    if !facility.ready {
        return Err(Fault::Action("facility_not_ready"));
    }
    if !has(facility, item) {
        return Err(Fault::Action("item_unavailable"));
    }
    match item {
        ItemKind::Spark => {
            if state.cells[actor].cargo.is_some() {
                return Err(Fault::Action("cargo_full"));
            }
            meter.charge(Cat::Transfers, 1)?;
            state.cells[actor].cargo = state.facilities[index].sparks.pop();
        }
        ItemKind::Material => {
            if state.cells[actor].material.is_some() {
                return Err(Fault::Action("material_full"));
            }
            meter.charge(Cat::Transfers, 1)?;
            state.cells[actor].material = state.facilities[index].materials.pop();
        }
        ItemKind::Part => {
            if state.cells[actor].part.is_some() {
                return Err(Fault::Action("part_full"));
            }
            meter.charge(Cat::Transfers, 1)?;
            state.cells[actor].part = state.facilities[index].parts.pop();
        }
    }
    Ok(())
}

/// Gather/supply/fetch execution: gather takes a unit from the stock under
/// the actor; supply and fetch operate on the facility tile the actor
/// stands on.
pub(crate) fn execute(
    action: &Action,
    experiment: &Experiment,
    state: &mut State,
    actor: usize,
    meter: &mut Meter,
) -> Result<(), Fault> {
    meter.charge(Cat::Checking, 1)?;
    if experiment.version < INDUSTRY_VERSION {
        return Err(Fault::Action("industry_unavailable"));
    }
    if matches!(action, Action::Gather) {
        if state.cells[actor].material.is_some() {
            return Err(Fault::Action("material_full"));
        }
        let spec = experiment
            .construction
            .as_ref()
            .ok_or(Fault::Action("construction_unavailable"))?;
        let index = spec
            .stocks
            .iter()
            .position(|entry| entry.position == state.cells[actor].position)
            .ok_or(Fault::Action("not_at_material_stock"))?;
        if state.construction.as_ref().unwrap().stocks[index]
            .units
            .is_empty()
        {
            return Err(Fault::Action("material_stock_empty"));
        }
        meter.charge(Cat::Transfers, 1)?;
        let material = state.construction.as_mut().unwrap().stocks[index]
            .units
            .remove(0);
        state.cells[actor].material = Some(material);
        return Ok(());
    }
    let Some(index) = state
        .facilities
        .iter()
        .position(|facility| facility.position == state.cells[actor].position)
    else {
        return Err(Fault::Action("not_at_facility"));
    };
    match action {
        Action::Supply { item } => supply(*item, index, actor, state, meter),
        Action::Fetch { item } => fetch(*item, index, actor, state, meter),
        _ => unreachable!(),
    }
}

/// The modeled work one facility step will do, charged before any mutation so
/// an exhausted tick leaves either an untouched or a fully processed set.
pub(crate) fn tick_work(state: &State) -> (u64, u64) {
    let mut checking = 0;
    let mut construction = 0;
    for facility in &state.facilities {
        if !facility.ready || facility.kind != FacilityKind::Fabricator {
            continue;
        }
        checking += 1;
        if facility.progress > 0 {
            if facility.progress == 1 {
                construction += 1;
            }
        } else if !facility.materials.is_empty()
            && !facility.sparks.is_empty()
            && facility.parts.len() < FACILITY_ITEM_LIMIT
            && facility.minted < 0xFFFF
        {
            construction += 1;
        }
    }
    (checking, construction)
}

/// One deterministic facility step: in-flight recipes finish and mint, idle
/// fabricators with inputs and output room consume into a new job.
pub(crate) fn tick(state: &mut State) {
    for facility in &mut state.facilities {
        if !facility.ready || facility.kind != FacilityKind::Fabricator {
            continue;
        }
        if facility.progress > 0 {
            facility.progress -= 1;
            if facility.progress == 0 {
                facility.parts.push(part_id(facility, facility.minted));
                facility.minted += 1;
            }
        } else if !facility.materials.is_empty()
            && !facility.sparks.is_empty()
            && facility.parts.len() < FACILITY_ITEM_LIMIT
            && facility.minted < 0xFFFF
        {
            facility.spent_materials.push(facility.materials.remove(0));
            facility.spent_sparks.push(facility.sparks.remove(0));
            facility.progress = FACILITY_RECIPE_TICKS;
        }
    }
}

/// Validate admitting a new facility site; returns the id it must carry.
pub fn validate_placement(
    experiment: &Experiment,
    state: &State,
    position: Point,
) -> Result<u16, String> {
    if experiment.version < INDUSTRY_VERSION {
        return Err("Structure placement requires habitat-v5.".into());
    }
    if experiment.construction.is_none() {
        return Err("Structure placement needs a declared material economy.".into());
    }
    if state.facilities.len() >= MAX_FACILITIES {
        return Err("The facility limit is reached.".into());
    }
    let usable = |point: Point| {
        point.x < experiment.width
            && point.y < experiment.height
            && !experiment.walls.contains(&point)
    };
    if !usable(position) {
        return Err("A site needs an open traversable position.".into());
    }
    let station = experiment
        .sources
        .iter()
        .map(|entry| entry.position)
        .chain(experiment.depots.iter().map(|entry| entry.position))
        .chain(experiment.beacons.iter().map(|entry| entry.position))
        .chain(experiment.valves.iter().map(|entry| entry.position))
        .chain(
            experiment
                .construction
                .iter()
                .flat_map(|spec| spec.stocks.iter().map(|entry| entry.position)),
        )
        .chain(experiment.construction.iter().flat_map(|spec| {
            spec.blueprints
                .iter()
                .map(|blueprint| blueprint.body.cell.position)
        }))
        .any(|point| point == position);
    if station || at(state, position).is_some() {
        return Err("A site cannot overlap another structure or reservation.".into());
    }
    if construction::reserved(experiment, state, position)
        || state.cells.iter().any(|cell| cell.position == position)
    {
        return Err("A site cannot open on an occupied position.".into());
    }
    state
        .facilities
        .iter()
        .map(|facility| facility.id)
        .max()
        .unwrap_or(0)
        .checked_add(if state.facilities.is_empty() { 0 } else { 1 })
        .ok_or_else(|| "Facility id space is exhausted.".into())
}

/// Structural and conservation invariants shared by live and receipt checks.
/// `strict` additionally requires the live set to be exactly the declared one
/// (receipts never contain admitted sites).
pub fn check_state(experiment: &Experiment, state: &State, strict: bool) -> Result<(), String> {
    if state.facilities.is_empty() {
        return if experiment.facilities.is_empty() {
            Ok(())
        } else {
            Err("Declared facilities are missing from state.".into())
        };
    }
    if experiment.version < INDUSTRY_VERSION || state.facilities.len() > MAX_FACILITIES {
        return Err("Facility state exceeds its admitted bound.".into());
    }
    let mut identities = BTreeSet::new();
    let mut positions = BTreeSet::new();
    let mut expected_parts = BTreeSet::new();
    let mut actual_parts = BTreeSet::new();
    let mut insert_part = |part: u32| -> Result<(), String> {
        if actual_parts.insert(part) {
            Ok(())
        } else {
            Err("Duplicate part token.".into())
        }
    };
    for facility in &state.facilities {
        if !identities.insert(facility.id)
            || !positions.insert((facility.position.x, facility.position.y))
        {
            return Err("Duplicate facility identity or position.".into());
        }
        if facility.position.x >= experiment.width
            || facility.position.y >= experiment.height
            || experiment.walls.contains(&facility.position)
        {
            return Err("A facility stands outside traversable terrain.".into());
        }
        if facility.materials.len() > FACILITY_ITEM_LIMIT
            || facility.sparks.len() > FACILITY_ITEM_LIMIT
            || facility.parts.len() > FACILITY_ITEM_LIMIT
            || facility.progress > FACILITY_RECIPE_TICKS
            || facility.minted > 0xFFFF
        {
            return Err("A facility exceeds its bounded buffers.".into());
        }
        let declared = experiment
            .facilities
            .iter()
            .find(|decl| decl.id == facility.id);
        if let Some(decl) = declared {
            if decl.kind != facility.kind || decl.position != facility.position {
                return Err("A declared facility changed its kind or position.".into());
            }
        } else if strict {
            return Err("An undeclared facility appears in a receipt.".into());
        }
        let (bill_material, bill_part) = if declared.is_some() {
            (0, 0)
        } else {
            bill(facility.kind)
        };
        let in_flight = usize::from(facility.progress > 0);
        match (facility.kind, facility.ready) {
            (FacilityKind::Fabricator, _) | (FacilityKind::Storehouse, true) => {}
            (FacilityKind::Storehouse, false) => {
                if facility.minted != 0 || facility.progress != 0 {
                    return Err("An unbuilt storehouse produced work.".into());
                }
            }
        }
        if facility.kind == FacilityKind::Storehouse
            && (facility.minted != 0 || facility.progress != 0 || !facility.spent_sparks.is_empty())
        {
            return Err("A storehouse cannot burn sparks or mint parts.".into());
        }
        let material_ok = if facility.ready {
            facility.needed_material == 0
                && facility.needed_part == 0
                && facility.spent_materials.len()
                    == usize::from(bill_material) + facility.minted as usize + in_flight
                && facility.spent_parts.len() == usize::from(bill_part)
                && facility.spent_sparks.len()
                    == if facility.kind == FacilityKind::Fabricator {
                        facility.minted as usize + in_flight
                    } else {
                        0
                    }
        } else {
            facility.materials.is_empty()
                && facility.sparks.is_empty()
                && facility.parts.is_empty()
                && facility.progress == 0
                && usize::from(facility.needed_material) + facility.spent_materials.len()
                    == usize::from(bill_material)
                && usize::from(facility.needed_part) + facility.spent_parts.len()
                    == usize::from(bill_part)
                && facility.spent_sparks.is_empty()
        };
        if !material_ok {
            return Err("A facility's item or construction ledger does not balance.".into());
        }
        for serial in 0..facility.minted {
            expected_parts.insert(part_id(facility, serial));
        }
        for part in facility.parts.iter().chain(&facility.spent_parts) {
            insert_part(*part)?;
        }
    }
    for cell in &state.cells {
        if let Some(part) = cell.part {
            insert_part(part)?;
        }
    }
    for decl in &experiment.facilities {
        if !state
            .facilities
            .iter()
            .any(|facility| facility.id == decl.id)
        {
            return Err("A declared facility is missing from state.".into());
        }
    }
    if expected_parts != actual_parts {
        return Err("Part inventory changed.".into());
    }
    Ok(())
}

/// Per-tick modeled checking work: facility structure plus every held and
/// spent item, matching the conservation sweep in `check_state`.
pub(crate) fn state_checking(state: &State) -> u64 {
    (state
        .facilities
        .iter()
        .map(|facility| {
            1 + facility.materials.len()
                + facility.sparks.len()
                + facility.parts.len()
                + facility.spent_materials.len()
                + facility.spent_sparks.len()
                + facility.spent_parts.len()
                + facility.minted as usize
        })
        .sum::<usize>()
        + state
            .cells
            .iter()
            .filter(|cell| cell.part.is_some())
            .count()) as u64
}
