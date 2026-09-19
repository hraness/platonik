//! Independent material, construction, and v4 program-edit effect checker.
//! No interpreter or construction executor is called here.
use super::{artifact_hash, ensure, ids_match};
use crate::model::*;
use std::collections::BTreeSet;

pub(super) fn definition<'a>(
    experiment: &'a Experiment,
    state: &'a State,
    id: u16,
) -> Option<&'a Cell> {
    experiment
        .cells
        .iter()
        .find(|cell| cell.id == id)
        .or_else(|| {
            state
                .construction
                .as_ref()?
                .births
                .iter()
                .find(|birth| birth.body.cell.id == id)
                .map(|birth| &birth.body.cell)
        })
}

pub(super) fn links<'a>(experiment: &'a Experiment, state: &'a State) -> Vec<&'a Link> {
    experiment
        .links
        .iter()
        .chain(
            state
                .construction
                .iter()
                .flat_map(|construction| &construction.births)
                .flat_map(|birth| &birth.body.links),
        )
        .collect()
}

fn blueprint(experiment: &Experiment, id: u16) -> Result<&Blueprint, String> {
    experiment
        .construction
        .as_ref()
        .and_then(|spec| spec.blueprints.iter().find(|blueprint| blueprint.id == id))
        .ok_or_else(|| "Unknown construction blueprint.".into())
}

fn changed_body(body: &BlueprintBody, rule: u8, value: u8) -> Result<BlueprintBody, String> {
    let direction = match value {
        0 => Relative::Forward,
        1 => Relative::Left,
        2 => Relative::Right,
        3 => Relative::Back,
        _ => return Err("A direction edit reads an invalid register value.".into()),
    };
    let mut next = body.clone();
    let action = &mut next
        .cell
        .program
        .rules
        .get_mut(usize::from(rule))
        .ok_or("A direction edit names an absent rule.")?
        .action;
    let (Action::Move { direction: current } | Action::Turn { direction: current }) = action else {
        return Err("A direction edit changes a non-direction action.".into());
    };
    ensure(*current != direction, "A direction edit makes no change.")?;
    *current = direction;
    Ok(next)
}

/// Reconstruct from the immutable seed, never from the executable's edit helper.
fn edited_body(
    experiment: &Experiment,
    declared: &Blueprint,
    edits: &[DirectionEdit],
    parent: u16,
    through: u32,
) -> Result<BlueprintBody, String> {
    ensure(
        edits.len() <= MAX_PROGRAM_EDITS
            && (edits.is_empty() || experiment.version >= VARIATION_VERSION),
        "Program edits exceed their limit or belong to an older protocol.",
    )?;
    let mut body = declared.body.clone();
    let mut previous_tick = 0;
    for edit in edits {
        ensure(
            edit.actor == parent
                && edit.slot < 4
                && edit.tick > previous_tick
                && edit.tick <= through
                && edit.before_hash == artifact_hash(&body)?,
            "Program edit provenance, order, or parent body is invalid.",
        )?;
        body = changed_body(&body, edit.rule, edit.value)?;
        let bytes = serde_json::to_vec(&body).map_err(|error| error.to_string())?;
        ensure(
            bytes.len() <= MAX_BLUEPRINT_BYTES
                && edit.bytes_written as usize == bytes.len()
                && edit.after_hash == artifact_hash(&body)?,
            "Program edit body, charged length, or result identity is invalid.",
        )?;
        previous_tick = edit.tick;
    }
    Ok(body)
}

/// Cumulative committed copying includes the seed and every complete rewrite.
/// Looking only at live byte length would erase work when an operand gets shorter.
pub(super) fn copying_work(experiment: &Experiment, state: &State) -> Result<u64, String> {
    let mut total = 0u64;
    if let Some(construction) = &state.construction {
        for assembly in &construction.assemblies {
            let declared = blueprint(experiment, assembly.blueprint)?;
            let seed = serde_json::to_vec(&declared.body).map_err(|error| error.to_string())?;
            total += if assembly.edits.is_empty() {
                assembly.copied.len()
            } else {
                seed.len()
            } as u64;
            total += assembly
                .edits
                .iter()
                .map(|edit| u64::from(edit.bytes_written))
                .sum::<u64>();
        }
        for birth in &construction.births {
            let declared = blueprint(experiment, birth.blueprint)?;
            total += serde_json::to_vec(&declared.body)
                .map_err(|error| error.to_string())?
                .len() as u64;
            total += birth
                .edits
                .iter()
                .map(|edit| u64::from(edit.bytes_written))
                .sum::<u64>();
        }
    }
    Ok(total)
}

pub(super) fn edit_charges(
    experiment: &Experiment,
    state: &State,
    tick: u32,
) -> Result<(u64, u64), String> {
    let mut checking = 0;
    let mut count = 0;
    if let Some(construction) = &state.construction {
        let histories = construction
            .assemblies
            .iter()
            .map(|entry| (entry.blueprint, &entry.edits))
            .chain(
                construction
                    .births
                    .iter()
                    .map(|entry| (entry.blueprint, &entry.edits)),
            );
        for (id, edits) in histories {
            let mut body = blueprint(experiment, id)?.body.clone();
            for edit in edits {
                let old_len = serde_json::to_vec(&body)
                    .map_err(|error| error.to_string())?
                    .len();
                body = changed_body(&body, edit.rule, edit.value)?;
                if edit.tick == tick {
                    checking += 1 + old_len as u64 + u64::from(edit.bytes_written);
                    count += 1;
                }
            }
        }
    }
    Ok((checking, count))
}

pub(super) fn reserved(experiment: &Experiment, state: &State, point: Point) -> bool {
    state
        .construction
        .iter()
        .flat_map(|construction| &construction.assemblies)
        .any(|assembly| {
            blueprint(experiment, assembly.blueprint)
                .is_ok_and(|blueprint| blueprint.body.cell.position == point)
        })
}

pub(super) fn validate_state(experiment: &Experiment, state: &State) -> Result<(), String> {
    let Some(spec) = &experiment.construction else {
        return ensure(
            state.construction.is_none()
                && state.facilities.is_empty()
                && state
                    .cells
                    .iter()
                    .all(|cell| cell.material.is_none() && cell.part.is_none()),
            "Undeclared construction state, facility, or held item.",
        );
    };
    ensure(
        experiment.version >= CONSTRUCTION_VERSION,
        "Construction requires v3 or later.",
    )?;
    let construction = state
        .construction
        .as_ref()
        .ok_or("Missing construction state.")?;
    ensure(
        ids_match(
            spec.stocks.iter().map(|stock| stock.id),
            construction.stocks.iter().map(|stock| stock.id),
        ),
        "Material cache identities changed.",
    )?;
    let initial: BTreeSet<_> = spec
        .stocks
        .iter()
        .flat_map(|stock| stock.units.iter().copied())
        .collect();
    let mut observed = BTreeSet::new();
    for material in construction
        .stocks
        .iter()
        .flat_map(|stock| stock.units.iter().copied())
        .chain(state.cells.iter().filter_map(|cell| cell.material))
        .chain(state.facilities.iter().flat_map(|facility| {
            facility
                .materials
                .iter()
                .chain(facility.spent_materials.iter())
                .copied()
        }))
        .chain(
            construction
                .assemblies
                .iter()
                .map(|assembly| assembly.material),
        )
        .chain(construction.births.iter().map(|birth| birth.material))
    {
        ensure(
            initial.contains(&material) && observed.insert(material),
            "Material was created, substituted, or duplicated.",
        )?;
    }
    ensure(
        initial == observed,
        "Material disappeared from the accountable inventory.",
    )?;
    let mut used = BTreeSet::new();
    let mut occupied: BTreeSet<_> = state
        .cells
        .iter()
        .map(|cell| (cell.position.x, cell.position.y))
        .collect();
    for assembly in &construction.assemblies {
        let declared = blueprint(experiment, assembly.blueprint)?;
        ensure(
            used.insert(assembly.blueprint),
            "A blueprint was assembled more than once.",
        )?;
        ensure(
            state.cells.iter().any(|cell| cell.id == assembly.parent),
            "An assembly has an unknown parent.",
        )?;
        let body = edited_body(
            experiment,
            declared,
            &assembly.edits,
            assembly.parent,
            state.tick,
        )?;
        let bytes = serde_json::to_vec(&body).map_err(|error| error.to_string())?;
        ensure(
            !assembly.copied.is_empty()
                && bytes.starts_with(&assembly.copied)
                && (assembly.edits.is_empty()
                    || (assembly.copied == bytes && assembly.wired == body.links)),
            "Assembly bytes are not a genuine declared prefix.",
        )?;
        ensure(
            declared.body.links.starts_with(&assembly.wired)
                && (assembly.wired.is_empty() || assembly.copied == bytes),
            "Wiring precedes copying or differs from the declared prefix.",
        )?;
        let point = declared.body.cell.position;
        ensure(
            occupied.insert((point.x, point.y)),
            "An inactive assembly overlaps another body or reservation.",
        )?;
    }
    for birth in &construction.births {
        let declared = blueprint(experiment, birth.blueprint)?;
        ensure(
            used.insert(birth.blueprint),
            "A blueprint is both staged and born, or born twice.",
        )?;
        let body = edited_body(
            experiment,
            declared,
            &birth.edits,
            birth.parent,
            birth.tick.saturating_sub(1),
        )?;
        ensure(
            birth.tick > 0 && birth.tick <= state.tick && birth.body == body,
            "A birth has an impossible time or altered body.",
        )?;
        ensure(
            state.cells.iter().any(|cell| cell.id == birth.parent),
            "A child has an unknown parent.",
        )?;
        if let Some(parent) = construction
            .births
            .iter()
            .find(|parent| parent.body.cell.id == birth.parent)
        {
            ensure(
                parent.tick < birth.tick,
                "A newborn built another child before eligibility.",
            )?;
        }
    }
    Ok(())
}

pub(super) fn validate_initial(experiment: &Experiment, state: &State) -> Result<(), String> {
    if let Some(spec) = &experiment.construction {
        let actual = state
            .construction
            .as_ref()
            .ok_or("Missing initial construction state.")?;
        ensure(
            actual.assemblies.is_empty()
                && actual.births.is_empty()
                && actual.stocks.len() == spec.stocks.len()
                && actual
                    .stocks
                    .iter()
                    .zip(&spec.stocks)
                    .all(|(actual, declared)| {
                        actual.id == declared.id && actual.units == declared.units
                    }),
            "Initial construction includes unearned work or changed stock.",
        )?;
    }
    ensure(
        state
            .cells
            .iter()
            .all(|cell| cell.material.is_none() && cell.part.is_none()),
        "A cell starts with unacquired material or parts.",
    )?;
    ensure(
        state.facilities == crate::industry::initial_state(experiment),
        "Facilities start other than declared with empty buffers.",
    )
}

/// Apply only the successful action recorded in the trace. Rule choice and exact
/// charges remain additionally checked by fresh replay of the immutable input.
pub(super) fn apply(
    experiment: &Experiment,
    state: &mut State,
    index: usize,
    action: &Action,
    tick: u32,
) -> Result<(), String> {
    let position = state.cells[index].position;
    let parent = state.cells[index].id;
    match action {
        Action::GatherMaterial { stock } => {
            let declared = experiment
                .construction
                .as_ref()
                .and_then(|spec| spec.stocks.iter().find(|candidate| candidate.id == *stock))
                .ok_or("Gather names an unknown material cache.")?;
            ensure(
                position == declared.position && state.cells[index].material.is_none(),
                "Gather is nonlocal or overwrites carried material.",
            )?;
            let source = state
                .construction
                .as_mut()
                .ok_or("Gather outside construction.")?
                .stocks
                .iter_mut()
                .find(|source| source.id == *stock)
                .ok_or("Missing material cache.")?;
            ensure(
                !source.units.is_empty(),
                "Gather creates material from an empty cache.",
            )?;
            state.cells[index].material = Some(source.units.remove(0));
        }
        Action::Build { blueprint: id }
        | Action::Activate { blueprint: id }
        | Action::EditDirection { blueprint: id, .. } => {
            let declared = blueprint(experiment, *id)?;
            let destination = declared.body.cell.position;
            ensure(
                position.distance(destination) == 1,
                "Construction is nonlocal.",
            )?;
            ensure(
                !state.cells.iter().any(|cell| cell.position == destination),
                "Construction overwrites an occupied tile.",
            )?;
            let construction = state
                .construction
                .as_mut()
                .ok_or("Build outside construction.")?;
            ensure(
                !construction
                    .births
                    .iter()
                    .any(|birth| birth.blueprint == *id),
                "Blueprint activated twice.",
            )?;
            ensure(
                !construction.assemblies.iter().any(|assembly| {
                    assembly.blueprint != *id
                        && blueprint(experiment, assembly.blueprint)
                            .is_ok_and(|other| other.body.cell.position == destination)
                }),
                "Construction overwrites another reservation.",
            )?;
            let assembly_index = construction
                .assemblies
                .iter()
                .position(|assembly| assembly.blueprint == *id);
            let body = if let Some(assembly_index) = assembly_index {
                let assembly = &construction.assemblies[assembly_index];
                edited_body(
                    experiment,
                    declared,
                    &assembly.edits,
                    assembly.parent,
                    tick.saturating_sub(1),
                )?
            } else {
                declared.body.clone()
            };
            let bytes = serde_json::to_vec(&body).map_err(|error| error.to_string())?;
            if let Action::EditDirection { rule, slot, .. } = action {
                ensure(
                    experiment.version >= VARIATION_VERSION && *slot < 4,
                    "Direction editing requires v4 and a local register.",
                )?;
                let assembly = &mut construction.assemblies
                    [assembly_index.ok_or("Editing has no completed assembly.")?];
                ensure(
                    assembly.parent == parent
                        && assembly.copied == bytes
                        && assembly.wired == body.links
                        && assembly.edits.len() < MAX_PROGRAM_EDITS,
                    "Editing precedes complete owned construction or exceeds its limit.",
                )?;
                let value = state.cells[index].memory[usize::from(*slot)];
                let changed = changed_body(&body, *rule, value)?;
                let changed_bytes =
                    serde_json::to_vec(&changed).map_err(|error| error.to_string())?;
                ensure(
                    changed_bytes.len() <= MAX_BLUEPRINT_BYTES,
                    "Edited body exceeds the byte limit.",
                )?;
                assembly.edits.push(DirectionEdit {
                    tick,
                    actor: parent,
                    rule: *rule,
                    slot: *slot,
                    value,
                    before_hash: artifact_hash(&body)?,
                    after_hash: artifact_hash(&changed)?,
                    bytes_written: changed_bytes.len() as u32,
                });
                assembly.copied = changed_bytes;
                return Ok(());
            }
            if matches!(action, Action::Build { .. }) {
                let assembly_index = if let Some(index) = assembly_index {
                    index
                } else {
                    let material = state.cells[index]
                        .material
                        .take()
                        .ok_or("Build has no acquired material to escrow.")?;
                    construction.assemblies.push(Assembly {
                        blueprint: *id,
                        parent,
                        material,
                        copied: Vec::new(),
                        wired: Vec::new(),
                        edits: Vec::new(),
                    });
                    construction.assemblies.len() - 1
                };
                let assembly = &mut construction.assemblies[assembly_index];
                ensure(
                    assembly.parent == parent,
                    "A different builder took over an assembly.",
                )?;
                if assembly.copied.len() < bytes.len() {
                    let end = (assembly.copied.len() + 32).min(bytes.len());
                    assembly
                        .copied
                        .extend_from_slice(&bytes[assembly.copied.len()..end]);
                } else {
                    let wire =
                        declared.body.links.get(assembly.wired.len()).ok_or(
                            "A completed assembly claims additional successful build work.",
                        )?;
                    assembly.wired.push(wire.clone());
                }
            } else {
                let assembly_index =
                    assembly_index.ok_or("Activation has no completed assembly.")?;
                let assembly = &construction.assemblies[assembly_index];
                ensure(
                    assembly.parent == parent
                        && assembly.copied == bytes
                        && assembly.wired == declared.body.links,
                    "Activation precedes complete owned copying and wiring.",
                )?;
                let body: BlueprintBody =
                    serde_json::from_slice(&assembly.copied).map_err(|error| error.to_string())?;
                let endpoint = |id: u16| -> Option<Point> {
                    if id == body.cell.id {
                        Some(body.cell.position)
                    } else {
                        state
                            .cells
                            .iter()
                            .find(|cell| cell.id == id)
                            .map(|cell| cell.position)
                    }
                };
                for link in &body.links {
                    let origin = match link.from {
                        Endpoint::Cell { id, .. } => endpoint(id),
                        Endpoint::Depot { id } => experiment
                            .depots
                            .iter()
                            .find(|depot| depot.id == id)
                            .map(|depot| depot.position),
                    }
                    .ok_or("Activated link has no sender.")?;
                    let target = endpoint(link.to_cell).ok_or("Activated link has no receiver.")?;
                    ensure(
                        origin.distance(target) == 1,
                        "Activated wiring connects nonadjacent endpoints.",
                    )?;
                }
                let assembly = construction.assemblies.remove(assembly_index);
                state.cells.push(CellState {
                    id: body.cell.id,
                    position: body.cell.position,
                    heading: body.cell.heading,
                    memory: body.cell.memory,
                    evidence: [None; 4],
                    cargo: None,
                    inbox: [None, None, None, None],
                    material: None,
                    part: None,
                    frame: None,
                });
                state
                    .links
                    .extend(body.links.iter().map(|link| EnabledState {
                        id: link.id,
                        enabled: link.enabled,
                    }));
                construction.births.push(Birth {
                    blueprint: *id,
                    parent,
                    material: assembly.material,
                    tick,
                    body,
                    edits: assembly.edits,
                });
            }
        }
        _ => return Err("Unexpected construction action.".into()),
    }
    Ok(())
}
