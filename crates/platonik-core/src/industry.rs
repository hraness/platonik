//! First-class facilities (habitat-v5). Declared facilities start active;
//! admitted sites finish once creatures deliver their complete item bill.
//! Fabricators mint parts, assemblers mint frames, drills extract, cranes move,
//! and storehouses buffer. Consumed tokens stay accountable in the facility's
//! `spent_*` lists so conservation ledgers remain exact.
use crate::construction;
use crate::model::*;
use crate::policy::Fault;
use crate::sim::{Cat, Meter};
use std::collections::BTreeSet;

/// A site's required material, part, and frame units.
pub fn bill(kind: FacilityKind) -> (u8, u8, u8) {
    match kind {
        FacilityKind::Fabricator => (3, 2, 0),
        FacilityKind::Storehouse => (2, 1, 0),
        FacilityKind::Miner => (2, 1, 0),
        FacilityKind::Assembler => (4, 2, 0),
        FacilityKind::Crane => (1, 1, 1),
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
            needed_frame: 0,
            materials: Vec::new(),
            sparks: Vec::new(),
            parts: Vec::new(),
            frames: Vec::new(),
            spent_materials: Vec::new(),
            spent_sparks: Vec::new(),
            spent_parts: Vec::new(),
            spent_frames: Vec::new(),
            progress: 0,
            minted: 0,
        })
        .collect()
}

/// An admitted site starts unready and holds nothing but its bill history.
pub fn site(id: u16, kind: FacilityKind, position: Point) -> FacilityState {
    let (material, part, frame) = bill(kind);
    FacilityState {
        id,
        kind,
        position,
        ready: false,
        needed_material: material,
        needed_part: part,
        needed_frame: frame,
        materials: Vec::new(),
        sparks: Vec::new(),
        parts: Vec::new(),
        frames: Vec::new(),
        spent_materials: Vec::new(),
        spent_sparks: Vec::new(),
        spent_parts: Vec::new(),
        spent_frames: Vec::new(),
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
        ItemKind::Frame => &facility.frames,
    }
}

fn held_mut(facility: &mut FacilityState, item: ItemKind) -> &mut Vec<u32> {
    match item {
        ItemKind::Material => &mut facility.materials,
        ItemKind::Spark => unreachable!("sparks are not unit items"),
        ItemKind::Part => &mut facility.parts,
        ItemKind::Frame => &mut facility.frames,
    }
}

fn held_len(facility: &FacilityState, item: ItemKind) -> usize {
    match item {
        ItemKind::Spark => facility.sparks.len(),
        _ => held(facility, item).len(),
    }
}

/// What a ready facility accepts as input: producers take their recipe
/// ingredients, a storehouse takes anything, and miners and cranes are
/// pure movers with no input slots.
pub fn accepts(facility: &FacilityState, item: ItemKind) -> bool {
    if !facility.ready {
        return false;
    }
    let usable = matches!(
        (facility.kind, item),
        (
            FacilityKind::Fabricator,
            ItemKind::Material | ItemKind::Spark
        ) | (
            FacilityKind::Assembler,
            ItemKind::Material | ItemKind::Part | ItemKind::Spark
        ) | (FacilityKind::Storehouse, _)
    );
    usable && held_len(facility, item) < FACILITY_ITEM_LIMIT
}

/// Whether the facility here accepts that item right now: a site accepts only
/// remaining bill items, and a ready facility accepts its input set.
pub fn needs(facility: &FacilityState, item: ItemKind) -> bool {
    if !facility.ready {
        return match item {
            ItemKind::Material => facility.needed_material > 0,
            ItemKind::Part => facility.needed_part > 0,
            ItemKind::Frame => facility.needed_frame > 0,
            ItemKind::Spark => false,
        };
    }
    accepts(facility, item)
}

/// Whether the facility has a fetchable item: producers yield only their
/// own outputs, and a storehouse yields whatever it holds.
pub fn has(facility: &FacilityState, item: ItemKind) -> bool {
    if !facility.ready {
        return false;
    }
    match (facility.kind, item) {
        (FacilityKind::Fabricator, ItemKind::Part) => !facility.parts.is_empty(),
        (FacilityKind::Miner, ItemKind::Material) => !facility.materials.is_empty(),
        (FacilityKind::Assembler, ItemKind::Frame) => !facility.frames.is_empty(),
        (FacilityKind::Storehouse, item) => held_len(facility, item) > 0,
        _ => false,
    }
}

fn finish(facility: &mut FacilityState) {
    if facility.needed_material == 0 && facility.needed_part == 0 && facility.needed_frame == 0 {
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
            if !accepts(facility, ItemKind::Spark) {
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
                if !accepts(facility, ItemKind::Material) {
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
                if !accepts(facility, ItemKind::Part) {
                    return Err(Fault::Action("facility_rejects"));
                }
                meter.charge(Cat::Transfers, 1)?;
                state.facilities[index].parts.push(part);
            }
            state.cells[actor].part = None;
        }
        ItemKind::Frame => {
            let frame = state.cells[actor]
                .frame
                .ok_or(Fault::Action("item_missing"))?;
            if !facility.ready {
                if facility.needed_frame == 0 {
                    return Err(Fault::Action("facility_rejects"));
                }
                meter.charge(Cat::Transfers, 1)?;
                meter.charge(Cat::Construction, 1)?;
                let facility = &mut state.facilities[index];
                facility.needed_frame -= 1;
                facility.spent_frames.push(frame);
                finish(facility);
            } else {
                if !accepts(facility, ItemKind::Frame) {
                    return Err(Fault::Action("facility_rejects"));
                }
                meter.charge(Cat::Transfers, 1)?;
                state.facilities[index].frames.push(frame);
            }
            state.cells[actor].frame = None;
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
        ItemKind::Frame => {
            if state.cells[actor].frame.is_some() {
                return Err(Fault::Action("frame_full"));
            }
            meter.charge(Cat::Transfers, 1)?;
            state.cells[actor].frame = state.facilities[index].frames.pop();
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

/// Whether a miner can move another unit out of its deposit: buffer room and
/// a non-empty stock under the drill.
pub(crate) fn can_extract(
    experiment: &Experiment,
    construction: Option<&crate::model::ConstructionState>,
    facility: &FacilityState,
) -> bool {
    if facility.materials.len() >= FACILITY_ITEM_LIMIT {
        return false;
    }
    let (Some(spec), Some(state)) = (experiment.construction.as_ref(), construction) else {
        return false;
    };
    spec.stocks
        .iter()
        .position(|stock| stock.position == facility.position)
        .is_some_and(|index| !state.stocks[index].units.is_empty())
}

fn extract(experiment: &Experiment, index: usize, state: &mut State) {
    let facility = &state.facilities[index];
    if !can_extract(experiment, state.construction.as_ref(), facility) {
        return;
    }
    let stock = spec_stock_index(experiment, facility.position).unwrap();
    let unit = state.construction.as_mut().unwrap().stocks[stock]
        .units
        .remove(0);
    let facility = &mut state.facilities[index];
    facility.materials.push(unit);
    facility.minted += 1;
}

fn spec_stock_index(experiment: &Experiment, position: Point) -> Option<usize> {
    experiment
        .construction
        .as_ref()?
        .stocks
        .iter()
        .position(|stock| stock.position == position)
}

fn crane_arms(state: &State, position: Point) -> Vec<usize> {
    let mut arms: Vec<usize> = state
        .facilities
        .iter()
        .enumerate()
        .filter(|(_, facility)| facility.position.distance(position) == 1)
        .map(|(index, _)| index)
        .collect();
    arms.sort_by_key(|index| state.facilities[*index].id);
    arms
}

pub(crate) fn crane_move(state: &State, position: Point) -> Option<(usize, usize, ItemKind)> {
    let arms = crane_arms(state, position);
    for &source in &arms {
        for item in [
            ItemKind::Part,
            ItemKind::Frame,
            ItemKind::Material,
            ItemKind::Spark,
        ] {
            if !has(&state.facilities[source], item) {
                continue;
            }
            for &destination in &arms {
                if state.facilities[destination].id > state.facilities[source].id
                    && accepts(&state.facilities[destination], item)
                {
                    return Some((source, destination, item));
                }
            }
        }
    }
    None
}

fn transfer(state: &mut State, source: usize, destination: usize, item: ItemKind) {
    match item {
        ItemKind::Spark => {
            let spark = state.facilities[source].sparks.pop().unwrap();
            state.facilities[destination].sparks.push(spark);
        }
        _ => {
            let unit = held_mut(&mut state.facilities[source], item).pop().unwrap();
            held_mut(&mut state.facilities[destination], item).push(unit);
        }
    }
}

/// The modeled work one facility step will do, charged before any mutation so
/// an exhausted tick leaves either an untouched or a fully processed set.
pub(crate) fn tick_work(experiment: &Experiment, state: &State) -> (u64, u64) {
    let mut checking = 0;
    let mut construction = 0;
    for facility in &state.facilities {
        if !facility.ready {
            continue;
        }
        match facility.kind {
            FacilityKind::Fabricator => {
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
            FacilityKind::Assembler => {
                checking += 1;
                if facility.progress > 0 {
                    if facility.progress == 1 {
                        construction += 1;
                    }
                } else if !facility.materials.is_empty()
                    && !facility.parts.is_empty()
                    && !facility.sparks.is_empty()
                    && facility.frames.len() < FACILITY_ITEM_LIMIT
                    && facility.minted < 0xFFFF
                {
                    construction += 1;
                }
            }
            FacilityKind::Miner => {
                checking += 1;
                if facility.progress == 1
                    || (facility.progress == 0
                        && can_extract(experiment, state.construction.as_ref(), facility))
                {
                    construction += 1;
                }
            }
            FacilityKind::Crane => {
                checking += 1;
                if facility.progress == 1
                    || (facility.progress == 0 && crane_move(state, facility.position).is_some())
                {
                    construction += 1;
                }
            }
            FacilityKind::Storehouse => {}
        }
    }
    (checking, construction)
}

/// One deterministic facility step: in-flight recipes finish and mint, idle
/// producers with inputs and output room consume into a new job, miners pull
/// one unit from their deposit every MINER_PERIOD ticks while it lasts, and
/// cranes move one item between adjacent ready facilities every CRANE_PERIOD.
pub(crate) fn tick(experiment: &Experiment, state: &mut State) {
    for index in 0..state.facilities.len() {
        let facility = &state.facilities[index];
        if !facility.ready {
            continue;
        }
        match facility.kind {
            FacilityKind::Fabricator => {
                let facility = &mut state.facilities[index];
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
            FacilityKind::Assembler => {
                let facility = &mut state.facilities[index];
                if facility.progress > 0 {
                    facility.progress -= 1;
                    if facility.progress == 0 {
                        facility.frames.push(part_id(facility, facility.minted));
                        facility.minted += 1;
                    }
                } else if !facility.materials.is_empty()
                    && !facility.parts.is_empty()
                    && !facility.sparks.is_empty()
                    && facility.frames.len() < FACILITY_ITEM_LIMIT
                    && facility.minted < 0xFFFF
                {
                    facility.spent_materials.push(facility.materials.remove(0));
                    facility.spent_parts.push(facility.parts.remove(0));
                    facility.spent_sparks.push(facility.sparks.remove(0));
                    facility.progress = ASSEMBLER_RECIPE_TICKS;
                }
            }
            FacilityKind::Miner => {
                if facility.progress > 0 {
                    state.facilities[index].progress -= 1;
                    if state.facilities[index].progress == 0 {
                        extract(experiment, index, state);
                    }
                }
                if state.facilities[index].progress == 0
                    && can_extract(
                        experiment,
                        state.construction.as_ref(),
                        &state.facilities[index],
                    )
                {
                    state.facilities[index].progress = MINER_PERIOD;
                }
            }
            FacilityKind::Crane => {
                if state.facilities[index].progress > 0 {
                    state.facilities[index].progress -= 1;
                    if state.facilities[index].progress == 0
                        && let Some((source, destination, item)) =
                            crane_move(state, state.facilities[index].position)
                    {
                        transfer(state, source, destination, item);
                        state.facilities[index].minted += 1;
                    }
                }
                if state.facilities[index].progress == 0
                    && crane_move(state, state.facilities[index].position).is_some()
                {
                    state.facilities[index].progress = CRANE_PERIOD;
                }
            }
            FacilityKind::Storehouse => {}
        }
    }
}

/// Validate admitting a new facility site; returns the id it must carry.
/// A drill is the only kind allowed on a deposit — and it must sit on one.
pub fn validate_placement(
    experiment: &Experiment,
    state: &State,
    kind: FacilityKind,
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
    let on_stock = experiment
        .construction
        .iter()
        .flat_map(|spec| spec.stocks.iter())
        .any(|stock| stock.position == position);
    if kind == FacilityKind::Miner && !on_stock {
        return Err("A drill must sit on a material deposit.".into());
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
    if (station && !(kind == FacilityKind::Miner && on_stock)) || at(state, position).is_some() {
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
    let mut expected_frames = BTreeSet::new();
    let mut actual_frames = BTreeSet::new();
    let mut insert_part = |part: u32| -> Result<(), String> {
        if actual_parts.insert(part) {
            Ok(())
        } else {
            Err("Duplicate part token.".into())
        }
    };
    let mut insert_frame = |frame: u32| -> Result<(), String> {
        if actual_frames.insert(frame) {
            Ok(())
        } else {
            Err("Duplicate frame token.".into())
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
            || facility.frames.len() > FACILITY_ITEM_LIMIT
            || facility.progress
                > match facility.kind {
                    FacilityKind::Miner => MINER_PERIOD,
                    FacilityKind::Assembler => ASSEMBLER_RECIPE_TICKS,
                    FacilityKind::Crane => CRANE_PERIOD,
                    _ => FACILITY_RECIPE_TICKS,
                }
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
        let (bill_material, bill_part, bill_frame) = if declared.is_some() {
            (0, 0, 0)
        } else {
            bill(facility.kind)
        };
        // Only producers consume inputs per job: a miner's progress is an
        // extraction countdown, and a crane's minted counts moved items, so
        // neither shows up in spent-input ledgers.
        let consumed = if matches!(
            facility.kind,
            FacilityKind::Fabricator | FacilityKind::Assembler
        ) {
            facility.minted as usize + usize::from(facility.progress > 0)
        } else {
            0
        };
        // Inputs burned per job: material, part, spark.
        let (burn_material, burn_part, burn_spark) = match facility.kind {
            FacilityKind::Fabricator => (1, 0, 1),
            FacilityKind::Assembler => (1, 1, 1),
            _ => (0, 0, 0),
        };
        match (facility.kind, facility.ready) {
            (FacilityKind::Fabricator | FacilityKind::Assembler, _)
            | (FacilityKind::Storehouse | FacilityKind::Miner | FacilityKind::Crane, true) => {}
            (FacilityKind::Storehouse | FacilityKind::Miner | FacilityKind::Crane, false) => {
                if facility.minted != 0 || facility.progress != 0 {
                    return Err("An unbuilt facility produced work.".into());
                }
            }
        }
        if facility.kind == FacilityKind::Storehouse
            && (facility.minted != 0 || facility.progress != 0 || !facility.spent_sparks.is_empty())
        {
            return Err("A storehouse cannot burn sparks or mint parts.".into());
        }
        if facility.kind == FacilityKind::Miner
            && (!facility.sparks.is_empty()
                || !facility.parts.is_empty()
                || !facility.spent_sparks.is_empty()
                || !facility.frames.is_empty())
        {
            return Err("A drill cannot hold sparks, parts, or frames.".into());
        }
        if facility.kind == FacilityKind::Crane
            && (!facility.materials.is_empty()
                || !facility.sparks.is_empty()
                || !facility.parts.is_empty()
                || !facility.frames.is_empty())
        {
            return Err("A crane holds nothing between transfers.".into());
        }
        let material_ok = if facility.ready {
            facility.needed_material == 0
                && facility.needed_part == 0
                && facility.needed_frame == 0
                && facility.spent_materials.len()
                    == usize::from(bill_material) + consumed * burn_material
                && facility.spent_parts.len() == usize::from(bill_part) + consumed * burn_part
                && facility.spent_frames.len() == usize::from(bill_frame)
                && facility.spent_sparks.len() == consumed * burn_spark
        } else {
            facility.materials.is_empty()
                && facility.sparks.is_empty()
                && facility.parts.is_empty()
                && facility.frames.is_empty()
                && facility.progress == 0
                && usize::from(facility.needed_material) + facility.spent_materials.len()
                    == usize::from(bill_material)
                && usize::from(facility.needed_part) + facility.spent_parts.len()
                    == usize::from(bill_part)
                && usize::from(facility.needed_frame) + facility.spent_frames.len()
                    == usize::from(bill_frame)
                && facility.spent_sparks.is_empty()
        };
        if !material_ok {
            return Err("A facility's item or construction ledger does not balance.".into());
        }
        if facility.kind == FacilityKind::Fabricator {
            for serial in 0..facility.minted {
                expected_parts.insert(part_id(facility, serial));
            }
        }
        if facility.kind == FacilityKind::Assembler {
            for serial in 0..facility.minted {
                expected_frames.insert(part_id(facility, serial));
            }
        }
        for part in facility.parts.iter().chain(&facility.spent_parts) {
            insert_part(*part)?;
        }
        for frame in facility.frames.iter().chain(&facility.spent_frames) {
            insert_frame(*frame)?;
        }
    }
    for cell in &state.cells {
        if let Some(part) = cell.part {
            insert_part(part)?;
        }
        if let Some(frame) = cell.frame {
            insert_frame(frame)?;
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
    if expected_frames != actual_frames {
        return Err("Frame inventory changed.".into());
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
                + facility.frames.len()
                + facility.spent_materials.len()
                + facility.spent_sparks.len()
                + facility.spent_parts.len()
                + facility.spent_frames.len()
                + if facility.kind == FacilityKind::Crane {
                    0
                } else {
                    facility.minted as usize
                }
        })
        .sum::<usize>()
        + state
            .cells
            .iter()
            .filter(|cell| cell.part.is_some())
            .count()
        + state
            .cells
            .iter()
            .filter(|cell| cell.frame.is_some())
            .count()) as u64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{world, world_fixtures};

    fn state_with(facilities: Vec<FacilityDecl>) -> (Experiment, State) {
        let mut experiment = world_fixtures::homestead();
        experiment.facilities = facilities;
        let state = world::report(&world::new("Industry".into(), experiment.clone()).unwrap())
            .unwrap()
            .state;
        (experiment, state)
    }

    #[test]
    fn assembler_mints_a_conserved_frame_from_three_inputs() {
        let (experiment, mut state) = state_with(vec![
            FacilityDecl {
                id: 90,
                kind: FacilityKind::Fabricator,
                position: Point { x: 0, y: 4 },
            },
            FacilityDecl {
                id: 93,
                kind: FacilityKind::Assembler,
                position: Point { x: 12, y: 13 },
            },
        ]);
        let part = part_id(&state.facilities[0], 0);
        state.facilities[0].minted = 1;
        state.facilities[0].spent_materials.push(2001);
        state.facilities[0].spent_sparks.push(Spark {
            id: 201,
            bit: false,
        });
        state.facilities[1].materials.push(2002);
        state.facilities[1].parts.push(part);
        state.facilities[1].sparks.push(Spark {
            id: 202,
            bit: false,
        });

        for _ in 0..=ASSEMBLER_RECIPE_TICKS {
            tick(&experiment, &mut state);
        }

        assert_eq!(state.facilities[1].minted, 1);
        assert_eq!(
            state.facilities[1].frames,
            vec![part_id(&state.facilities[1], 0)]
        );
        assert_eq!(state.facilities[1].spent_parts, vec![part]);
        check_state(&experiment, &state, true).unwrap();
    }

    #[test]
    fn crane_moves_one_item_between_adjacent_ready_facilities() {
        let (experiment, mut state) = state_with(vec![
            FacilityDecl {
                id: 90,
                kind: FacilityKind::Storehouse,
                position: Point { x: 10, y: 5 },
            },
            FacilityDecl {
                id: 91,
                kind: FacilityKind::Crane,
                position: Point { x: 11, y: 5 },
            },
            FacilityDecl {
                id: 92,
                kind: FacilityKind::Storehouse,
                position: Point { x: 12, y: 5 },
            },
        ]);
        state.facilities[0].materials.push(2001);

        for _ in 0..=CRANE_PERIOD {
            tick(&experiment, &mut state);
        }

        assert!(state.facilities[0].materials.is_empty());
        assert_eq!(state.facilities[2].materials, vec![2001]);
        assert_eq!(state.facilities[1].minted, 1);
        for _ in 0..=CRANE_PERIOD {
            tick(&experiment, &mut state);
        }
        assert!(state.facilities[0].materials.is_empty());
        assert_eq!(state.facilities[2].materials, vec![2001]);
        assert_eq!(state.facilities[1].minted, 1);
        check_state(&experiment, &state, true).unwrap();
    }

    #[test]
    fn crane_site_requires_a_frame() {
        let crane = site(93, FacilityKind::Crane, Point { x: 12, y: 13 });
        assert!(!crane.ready);
        assert_eq!(bill(FacilityKind::Crane), (1, 1, 1));
        assert_eq!(crane.needed_frame, 1);
    }
}
