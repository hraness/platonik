//! A finite blueprint assembler. Copying a declared body does not discover a
//! program, confer native execution, or constitute autonomous reproduction.
use crate::model::*;
use crate::policy::Fault;
use crate::sim::{Cat, Meter};
use std::collections::BTreeSet;

pub fn payload(blueprint: &Blueprint) -> Result<Vec<u8>, String> {
    serde_json::to_vec(&blueprint.body).map_err(|error| error.to_string())
}

/// Initial definitions and the actual decoded bodies of previously born cells.
pub fn cell_definition<'a>(
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

/// Declared links become executable only when their complete body is activated.
pub fn link_definitions<'a>(experiment: &'a Experiment, state: &'a State) -> Vec<&'a Link> {
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

pub(crate) fn initial_state(specification: &ConstructionSpec) -> ConstructionState {
    ConstructionState {
        stocks: specification
            .stocks
            .iter()
            .map(|stock| MaterialStockState {
                id: stock.id,
                units: stock.units.clone(),
            })
            .collect(),
        assemblies: Vec::new(),
        births: Vec::new(),
    }
}

pub(crate) fn reserved(experiment: &Experiment, state: &State, point: Point) -> bool {
    state.construction.as_ref().is_some_and(|construction| {
        construction.assemblies.iter().any(|assembly| {
            experiment
                .construction
                .as_ref()
                .unwrap()
                .blueprints
                .iter()
                .any(|blueprint| {
                    blueprint.id == assembly.blueprint && blueprint.body.cell.position == point
                })
        })
    })
}

pub fn stage(
    experiment: &Experiment,
    state: &State,
    actor: usize,
    blueprint_id: u16,
) -> Option<AssemblyStage> {
    let spec = experiment.construction.as_ref()?;
    let construction = state.construction.as_ref()?;
    let blueprint = spec
        .blueprints
        .iter()
        .find(|blueprint| blueprint.id == blueprint_id)?;
    if state
        .cells
        .get(actor)?
        .position
        .distance(blueprint.body.cell.position)
        != 1
    {
        return None;
    }
    if construction
        .births
        .iter()
        .any(|birth| birth.blueprint == blueprint_id)
    {
        return Some(AssemblyStage::Born);
    }
    let Some(assembly) = construction
        .assemblies
        .iter()
        .find(|assembly| assembly.blueprint == blueprint_id)
    else {
        return Some(AssemblyStage::Absent);
    };
    let bytes = payload(blueprint).ok()?;
    Some(if assembly.copied.len() < bytes.len() {
        AssemblyStage::Copying
    } else if assembly.wired.len() < blueprint.body.links.len() {
        AssemblyStage::Wiring
    } else {
        AssemblyStage::Ready
    })
}

pub(crate) fn validate_spec(experiment: &Experiment) -> Result<(), String> {
    let Some(spec) = &experiment.construction else {
        return Ok(());
    };
    if experiment.version != CONSTRUCTION_VERSION {
        return Err("Construction requires habitat-v3.".into());
    }
    if spec.stocks.len() > 4
        || spec.blueprints.is_empty()
        || spec.blueprints.len() > 4
        || experiment.cells.len() + spec.blueprints.len() > 16
        || experiment.links.len()
            + spec
                .blueprints
                .iter()
                .map(|blueprint| blueprint.body.links.len())
                .sum::<usize>()
            > 32
    {
        return Err("Construction catalog exceeds its finite entity bounds.".into());
    }
    let usable = |point: Point| {
        point.x < experiment.width
            && point.y < experiment.height
            && !experiment.walls.contains(&point)
    };
    let mut stock_ids = BTreeSet::new();
    let mut stock_positions = BTreeSet::new();
    let mut units = BTreeSet::new();
    for stock in &spec.stocks {
        if !stock_ids.insert(stock.id)
            || !stock_positions.insert(stock.position)
            || !usable(stock.position)
        {
            return Err("Material stocks require distinct IDs and usable positions.".into());
        }
        for unit in &stock.units {
            if !units.insert(*unit) {
                return Err("Material token IDs must be unique.".into());
            }
        }
    }
    if units.len() > 32 {
        return Err("At most 32 material tokens are allowed.".into());
    }
    let mut blueprints = BTreeSet::new();
    let mut cells: BTreeSet<_> = experiment.cells.iter().map(|cell| cell.id).collect();
    let mut links: BTreeSet<_> = experiment.links.iter().map(|link| link.id).collect();
    let mut targets = BTreeSet::new();
    for blueprint in &spec.blueprints {
        if !blueprints.insert(blueprint.id)
            || !cells.insert(blueprint.body.cell.id)
            || !usable(blueprint.body.cell.position)
            || !targets.insert(blueprint.body.cell.position)
            || payload(blueprint)?.len() > MAX_BLUEPRINT_BYTES
        {
            return Err("Blueprint IDs, target cells, positions, or body size are invalid.".into());
        }
        crate::sim::validate_program(experiment, &blueprint.body.cell.program)?;
        for link in &blueprint.body.links {
            if !links.insert(link.id) || link.to_port >= 4 || !(1..=16).contains(&link.delay) {
                return Err("Blueprint links require unique IDs, bounded ports and delay.".into());
            }
            // A body can wire its new cell to existing genesis cells/depots. It
            // cannot create a link to an absent cell in some other blueprint.
            let target = if link.to_cell == blueprint.body.cell.id {
                &blueprint.body.cell
            } else {
                experiment
                    .cells
                    .iter()
                    .find(|cell| cell.id == link.to_cell)
                    .ok_or("Blueprint link target must be its child or an initial cell.")?
            };
            let origin = match link.from {
                Endpoint::Cell { id, port } => {
                    if port >= 4 {
                        return Err("Invalid blueprint source port.".into());
                    }
                    if id == blueprint.body.cell.id {
                        blueprint.body.cell.position
                    } else {
                        experiment
                            .cells
                            .iter()
                            .find(|cell| cell.id == id)
                            .ok_or("Blueprint link sender must be its child or an initial cell.")?
                            .position
                    }
                }
                Endpoint::Depot { id } => {
                    experiment
                        .depots
                        .iter()
                        .find(|depot| depot.id == id)
                        .ok_or("Unknown blueprint depot.")?
                        .position
                }
            };
            if origin.distance(target.position) != 1
                || (link.to_cell != blueprint.body.cell.id
                    && !matches!(link.from, Endpoint::Cell { id, .. } if id == blueprint.body.cell.id))
            {
                return Err("Every blueprint link must be adjacent and touch its new cell.".into());
            }
        }
    }
    Ok(())
}

pub(crate) fn execute(
    action: &Action,
    experiment: &Experiment,
    state: &mut State,
    actor: usize,
    meter: &mut Meter,
) -> Result<(), Fault> {
    meter.charge(Cat::Checking, 1)?;
    let spec = experiment
        .construction
        .as_ref()
        .ok_or(Fault::Action("construction_unavailable"))?;
    if let Action::GatherMaterial { stock } = action {
        if state.cells[actor].material.is_some() {
            return Err(Fault::Action("material_full"));
        }
        let index = spec
            .stocks
            .iter()
            .position(|entry| entry.id == *stock)
            .ok_or(Fault::Action("unknown_material_stock"))?;
        if spec.stocks[index].position != state.cells[actor].position {
            return Err(Fault::Action("not_at_material_stock"));
        }
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
    let id = match action {
        Action::Build { blueprint } | Action::Activate { blueprint } => *blueprint,
        _ => unreachable!(),
    };
    let blueprint = spec
        .blueprints
        .iter()
        .find(|blueprint| blueprint.id == id)
        .ok_or(Fault::Action("unknown_blueprint"))?;
    let position = blueprint.body.cell.position;
    if state.cells[actor].position.distance(position) != 1 {
        return Err(Fault::Action("construction_not_adjacent"));
    }
    let construction = state.construction.as_ref().unwrap();
    if construction
        .births
        .iter()
        .any(|birth| birth.blueprint == id)
    {
        return Err(Fault::Action("blueprint_already_born"));
    }
    let assembly_index = construction
        .assemblies
        .iter()
        .position(|assembly| assembly.blueprint == id);
    if assembly_index
        .is_some_and(|index| construction.assemblies[index].parent != state.cells[actor].id)
    {
        return Err(Fault::Action("assembly_owned_by_other"));
    }
    if state.cells.iter().any(|cell| cell.position == position) {
        return Err(Fault::Action("construction_target_occupied"));
    }
    let bytes = payload(blueprint).expect("validated blueprint serialization");
    if matches!(action, Action::Build { .. }) {
        let index = match assembly_index {
            Some(index) => index,
            None => {
                let material = state.cells[actor]
                    .material
                    .ok_or(Fault::Action("material_empty"))?;
                meter.charge(Cat::Construction, 1)?;
                meter.charge(Cat::Transfers, 1)?;
                let construction = state.construction.as_mut().unwrap();
                construction.assemblies.push(Assembly {
                    blueprint: id,
                    parent: state.cells[actor].id,
                    material,
                    copied: Vec::new(),
                    wired: Vec::new(),
                });
                state.cells[actor].material = None;
                construction.assemblies.len() - 1
            }
        };
        let assembly = &mut state.construction.as_mut().unwrap().assemblies[index];
        if assembly.copied.len() < bytes.len() {
            let end = (assembly.copied.len() + COPY_BYTES).min(bytes.len());
            meter.charge(Cat::Copying, (end - assembly.copied.len()) as u64)?;
            assembly
                .copied
                .extend_from_slice(&bytes[assembly.copied.len()..end]);
        } else if assembly.wired.len() < blueprint.body.links.len() {
            meter.charge(Cat::Construction, 1)?;
            assembly
                .wired
                .push(blueprint.body.links[assembly.wired.len()].clone());
        } else {
            return Err(Fault::Action("assembly_ready"));
        }
        return Ok(());
    }
    let index = assembly_index.ok_or(Fault::Action("assembly_missing"))?;
    let assembly = &state.construction.as_ref().unwrap().assemblies[index];
    if assembly.copied != bytes || assembly.wired != blueprint.body.links {
        return Err(Fault::Action("assembly_incomplete"));
    }
    let body: BlueprintBody = serde_json::from_slice(&assembly.copied)
        .map_err(|_| Fault::Action("invalid_copied_body"))?;
    if body != blueprint.body {
        return Err(Fault::Action("invalid_copied_body"));
    }
    for link in &body.links {
        meter.charge(Cat::Checking, 1)?;
        let target = if link.to_cell == body.cell.id {
            body.cell.position
        } else {
            state
                .cells
                .iter()
                .find(|cell| cell.id == link.to_cell)
                .ok_or(Fault::Action("construction_endpoint_missing"))?
                .position
        };
        let origin = match link.from {
            Endpoint::Cell { id, .. } if id == body.cell.id => body.cell.position,
            Endpoint::Cell { id, .. } => {
                state
                    .cells
                    .iter()
                    .find(|cell| cell.id == id)
                    .ok_or(Fault::Action("construction_endpoint_missing"))?
                    .position
            }
            Endpoint::Depot { id } => {
                experiment
                    .depots
                    .iter()
                    .find(|depot| depot.id == id)
                    .unwrap()
                    .position
            }
        };
        if origin.distance(target) != 1 {
            return Err(Fault::Action("construction_link_not_adjacent"));
        }
    }
    meter.charge(Cat::Construction, 1)?;
    meter.charge(Cat::Transfers, 1)?;
    let assembly = state
        .construction
        .as_mut()
        .unwrap()
        .assemblies
        .remove(index);
    state.cells.push(CellState {
        id: body.cell.id,
        position: body.cell.position,
        heading: body.cell.heading,
        memory: body.cell.memory,
        evidence: [None; 4],
        cargo: None,
        inbox: std::array::from_fn(|_| None),
        material: None,
    });
    state
        .links
        .extend(body.links.iter().map(|link| EnabledState {
            id: link.id,
            enabled: link.enabled,
        }));
    state.construction.as_mut().unwrap().births.push(Birth {
        blueprint: id,
        parent: assembly.parent,
        material: assembly.material,
        tick: state.tick,
        body,
    });
    Ok(())
}

/// Separate material and construction invariants; the Outcome remains the
/// original physical spark/beacon service result.
pub(crate) fn check_state(experiment: &Experiment, state: &State) -> Result<(), String> {
    let Some(spec) = &experiment.construction else {
        return if state.construction.is_none()
            && state.cells.iter().all(|cell| cell.material.is_none())
        {
            Ok(())
        } else {
            Err("Unexpected construction state.".into())
        };
    };
    let construction = state
        .construction
        .as_ref()
        .ok_or("Missing construction state.")?;
    if construction.stocks.len() != spec.stocks.len()
        || construction.assemblies.len() + construction.births.len() > spec.blueprints.len()
    {
        return Err("Construction state exceeds catalog bounds.".into());
    }
    let expected: BTreeSet<_> = spec
        .stocks
        .iter()
        .flat_map(|stock| stock.units.iter().copied())
        .collect();
    let mut actual = BTreeSet::new();
    for token in construction
        .stocks
        .iter()
        .flat_map(|stock| stock.units.iter().copied())
        .chain(state.cells.iter().filter_map(|cell| cell.material))
        .chain(
            construction
                .assemblies
                .iter()
                .map(|assembly| assembly.material),
        )
        .chain(construction.births.iter().map(|birth| birth.material))
    {
        if !actual.insert(token) {
            return Err("Duplicate material token.".into());
        }
    }
    if expected != actual {
        return Err("Material inventory changed.".into());
    }
    for (stock, definition) in construction.stocks.iter().zip(&spec.stocks) {
        if stock.id != definition.id || !definition.units.ends_with(&stock.units) {
            return Err("Material stock is not its original remaining suffix.".into());
        }
    }
    let mut used = BTreeSet::new();
    for assembly in &construction.assemblies {
        let blueprint = spec
            .blueprints
            .iter()
            .find(|blueprint| blueprint.id == assembly.blueprint)
            .ok_or("Unknown assembly.")?;
        let bytes = payload(blueprint)?;
        if !used.insert(assembly.blueprint)
            || !bytes.starts_with(&assembly.copied)
            || !blueprint.body.links.starts_with(&assembly.wired)
            || (!assembly.wired.is_empty() && assembly.copied != bytes)
            || assembly.copied.is_empty()
            || state
                .cells
                .iter()
                .any(|cell| cell.position == blueprint.body.cell.position)
            || !state.cells.iter().any(|cell| cell.id == assembly.parent)
        {
            return Err("Invalid inactive assembly prefix, owner, or reserved target.".into());
        }
    }
    for birth in &construction.births {
        let blueprint = spec
            .blueprints
            .iter()
            .find(|blueprint| blueprint.id == birth.blueprint)
            .ok_or("Unknown birth.")?;
        if !used.insert(birth.blueprint)
            || birth.body != blueprint.body
            || birth.tick == 0
            || birth.tick > state.tick
            || !state.cells.iter().any(|cell| cell.id == birth.parent)
            || !state.cells.iter().any(|cell| cell.id == birth.body.cell.id)
        {
            return Err("Invalid activated blueprint body or identity.".into());
        }
    }
    let definitions: BTreeSet<_> = experiment
        .cells
        .iter()
        .map(|cell| cell.id)
        .chain(construction.births.iter().map(|birth| birth.body.cell.id))
        .collect();
    let mut identities = BTreeSet::new();
    let mut positions = BTreeSet::new();
    for cell in &state.cells {
        if !identities.insert(cell.id) || !positions.insert(cell.position) {
            return Err("Duplicate runtime cell identity or position.".into());
        }
    }
    if identities != definitions {
        return Err("Installed cell identities differ from activated bodies.".into());
    }
    let expected_links: Vec<_> = link_definitions(experiment, state)
        .iter()
        .map(|link| link.id)
        .collect();
    if state.links.iter().map(|link| link.id).collect::<Vec<_>>() != expected_links {
        return Err("Installed link identities differ from activated bodies.".into());
    }
    Ok(())
}

pub(crate) fn initial_checking(spec: &ConstructionSpec) -> u64 {
    (spec.stocks.len()
        + spec.blueprints.len()
        + spec
            .stocks
            .iter()
            .map(|stock| stock.units.len())
            .sum::<usize>()
        + spec
            .blueprints
            .iter()
            .map(|blueprint| blueprint.body.links.len())
            .sum::<usize>()) as u64
}
pub(crate) fn state_checking(state: &State) -> u64 {
    state.construction.as_ref().map_or(0, |construction| {
        (construction.stocks.len()
            + construction.assemblies.len()
            + construction.births.len()
            + construction
                .stocks
                .iter()
                .map(|stock| stock.units.len())
                .sum::<usize>()
            + state
                .cells
                .iter()
                .filter(|cell| cell.material.is_some())
                .count()
            + construction.assemblies.len()
            + construction.births.len()) as u64
    })
}
