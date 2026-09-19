use serde::{Deserialize, Serialize};

pub const MODEL_VERSION: u32 = 1;
pub const PROTOCOL: &str = "platonik-habitat-v1";
pub const HAZARD_VERSION: u32 = 2;
pub const HAZARD_PROTOCOL: &str = "platonik-habitat-v2";
pub const CONSTRUCTION_VERSION: u32 = 3;
pub const CONSTRUCTION_PROTOCOL: &str = "platonik-habitat-v3";
pub const VARIATION_VERSION: u32 = 4;
pub const VARIATION_PROTOCOL: &str = "platonik-habitat-v4";
pub const INDUSTRY_VERSION: u32 = 5;
pub const INDUSTRY_PROTOCOL: &str = "platonik-habitat-v5";
pub const MAX_PROGRAM_EDITS: usize = 8;
pub const MAX_VARIATION_ACTIVATION_FUEL: u32 = 16_384;
pub const COPY_BYTES: usize = 32;
pub const MAX_BLUEPRINT_BYTES: usize = 4096;
pub const MAX_FACILITIES: usize = 12;
pub const FACILITY_ITEM_LIMIT: usize = 8;
pub const FACILITY_RECIPE_TICKS: u32 = 6;
pub const MINER_PERIOD: u32 = 12;
pub fn protocol_for_version(version: u32) -> Option<&'static str> {
    match version {
        MODEL_VERSION => Some(PROTOCOL),
        HAZARD_VERSION => Some(HAZARD_PROTOCOL),
        CONSTRUCTION_VERSION => Some(CONSTRUCTION_PROTOCOL),
        VARIATION_VERSION => Some(VARIATION_PROTOCOL),
        INDUSTRY_VERSION => Some(INDUSTRY_PROTOCOL),
        _ => None,
    }
}
pub const MAX_INPUT_BYTES: usize = 65_536;
pub const MAX_TICKS: u32 = 128;
pub const MAX_FUEL: u64 = 2_000_000;
pub const MAX_PENDING: usize = 128;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Point {
    pub x: u8,
    pub y: u8,
}
impl Point {
    pub fn distance(self, other: Self) -> u16 {
        self.x.abs_diff(other.x) as u16 + self.y.abs_diff(other.y) as u16
    }
}

/// A canonical undirected movement edge; closing it never removes either endpoint.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Edge {
    pub a: Point,
    pub b: Point,
}
impl Edge {
    pub fn new(a: Point, b: Point) -> Self {
        if a < b {
            Self { a, b }
        } else {
            Self { a: b, b: a }
        }
    }
    pub fn is_canonical(self) -> bool {
        self.a < self.b && self.a.distance(self.b) == 1
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Direction {
    North,
    East,
    South,
    West,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Relative {
    Forward,
    Left,
    Right,
    Back,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Condition {
    Carrying {
        value: bool,
    },
    AtSource {
        value: bool,
    },
    AtDepot {
        value: bool,
    },
    AtBeacon {
        value: bool,
    },
    AtReceiver {
        value: bool,
    },
    Blocked {
        direction: Relative,
        value: bool,
    },
    HasMessage {
        port: u8,
        value: bool,
    },
    MessageBit {
        port: u8,
        value: bool,
    },
    Memory {
        slot: u8,
        value: u8,
    },
    Heading {
        direction: Direction,
    },
    HasMaterial {
        value: bool,
    },
    AssemblyStage {
        blueprint: u16,
        stage: AssemblyStage,
    },
    AssemblyEdits {
        blueprint: u16,
        count: u8,
    },
    HasPart {
        value: bool,
    },
    AtStock {
        value: bool,
    },
    AtFacility {
        value: bool,
    },
    FacilityReady {
        value: bool,
    },
    FacilityNeeds {
        item: ItemKind,
        value: bool,
    },
    FacilityHas {
        item: ItemKind,
        value: bool,
    },
    FacilityIs {
        structure: FacilityKind,
        value: bool,
    },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum BitSource {
    Constant { value: bool },
    Memory { slot: u8 },
    Message { port: u8 },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Action {
    Move { direction: Relative },
    Turn { direction: Relative },
    Pickup,
    Drop,
    Wait,
    WriteMemory { slot: u8, value: u8 },
    TakeMessage { port: u8, slot: u8 },
    Send { port: u8, bit: BitSource },
    Route { valve: u16, bit: BitSource },
    GatherMaterial { stock: u16 },
    Build { blueprint: u16 },
    Activate { blueprint: u16 },
    EditDirection { blueprint: u16, rule: u8, slot: u8 },
    Gather,
    Supply { item: ItemKind },
    Fetch { item: ItemKind },
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemKind {
    Spark,
    Material,
    Part,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FacilityKind {
    Fabricator,
    Storehouse,
    Miner,
}
/// Declared industry: an active facility that exists from genesis.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FacilityDecl {
    pub id: u16,
    pub kind: FacilityKind,
    pub position: Point,
}
/// One facility's live state. `needed_*` is the remaining construction bill on
/// an admitted site; `spent_*` keeps consumed tokens accountable forever.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct FacilityState {
    pub id: u16,
    pub kind: FacilityKind,
    pub position: Point,
    pub ready: bool,
    pub needed_material: u8,
    pub needed_part: u8,
    pub materials: Vec<u32>,
    pub sparks: Vec<Spark>,
    pub parts: Vec<u32>,
    pub spent_materials: Vec<u32>,
    pub spent_sparks: Vec<Spark>,
    pub spent_parts: Vec<u32>,
    pub progress: u32,
    pub minted: u32,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MemoryWrite {
    pub slot: u8,
    pub value: u8,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Rule {
    pub when: Vec<Condition>,
    pub action: Action,
    pub remember: Option<MemoryWrite>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Program {
    pub rules: Vec<Rule>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Spark {
    pub id: u32,
    pub bit: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Cell {
    pub id: u16,
    pub position: Point,
    pub heading: Direction,
    pub mobile: bool,
    pub memory: [u8; 4],
    pub program: Program,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Source {
    pub id: u16,
    pub position: Point,
    pub sparks: Vec<Spark>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Depot {
    pub id: u16,
    pub position: Point,
    pub capacity: u8,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Beacon {
    pub id: u16,
    pub position: Point,
    pub accepts: bool,
    pub initial_charge: u32,
    pub drain_every: u32,
    pub drain_amount: u32,
    pub spark_charge: u32,
    pub required_deliveries: u32,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Valve {
    pub id: u16,
    pub position: Point,
    pub depot: u16,
    pub beacon_zero: u16,
    pub beacon_one: u16,
    pub enabled: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Endpoint {
    Cell { id: u16, port: u8 },
    Depot { id: u16 },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Link {
    pub id: u16,
    pub from: Endpoint,
    pub to_cell: u16,
    pub to_port: u8,
    pub delay: u32,
    pub enabled: bool,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssemblyStage {
    Absent,
    Copying,
    Wiring,
    Ready,
    Born,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MaterialStock {
    pub id: u16,
    pub position: Point,
    pub units: Vec<u32>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BlueprintBody {
    pub cell: Cell,
    pub links: Vec<Link>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Blueprint {
    pub id: u16,
    pub body: BlueprintBody,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConstructionSpec {
    pub stocks: Vec<MaterialStock>,
    pub blueprints: Vec<Blueprint>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MaterialStockState {
    pub id: u16,
    pub units: Vec<u32>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DirectionEdit {
    pub tick: u32,
    pub actor: u16,
    pub rule: u8,
    pub slot: u8,
    pub value: u8,
    pub before_hash: String,
    pub after_hash: String,
    pub bytes_written: u32,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Assembly {
    pub blueprint: u16,
    pub parent: u16,
    pub material: u32,
    pub copied: Vec<u8>,
    pub wired: Vec<Link>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub edits: Vec<DirectionEdit>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Birth {
    pub blueprint: u16,
    pub parent: u16,
    pub material: u32,
    pub tick: u32,
    pub body: BlueprintBody,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub edits: Vec<DirectionEdit>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ConstructionState {
    pub stocks: Vec<MaterialStockState>,
    pub assemblies: Vec<Assembly>,
    pub births: Vec<Birth>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum EventKind {
    LinkEnabled { id: u16, enabled: bool },
    ValveEnabled { id: u16, enabled: bool },
    ClearMemory { cell: u16 },
    EdgeBlocked { edge: Edge, blocked: bool },
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Event {
    pub tick: u32,
    pub event: EventKind,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Experiment {
    pub version: u32,
    pub seed: u64,
    pub width: u8,
    pub height: u8,
    pub walls: Vec<Point>,
    pub sources: Vec<Source>,
    pub depots: Vec<Depot>,
    pub beacons: Vec<Beacon>,
    pub valves: Vec<Valve>,
    pub cells: Vec<Cell>,
    pub links: Vec<Link>,
    pub events: Vec<Event>,
    pub ticks: u32,
    pub fuel: u64,
    pub activation_fuel: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub construction: Option<ConstructionSpec>,
    /// Declared industry; empty keeps habitat-v1..v4 bytes unchanged.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub facilities: Vec<FacilityDecl>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Costs {
    pub loading: u64,
    pub scheduling: u64,
    pub conditions: u64,
    pub sensors: u64,
    pub memory_reads: u64,
    pub memory_writes: u64,
    pub actions: u64,
    pub messages: u64,
    pub transfers: u64,
    pub checking: u64,
    pub draining: u64,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub copying: u64,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub construction: u64,
}
fn is_zero(value: &u64) -> bool {
    *value == 0
}
impl Costs {
    pub fn total(&self) -> u64 {
        self.loading
            + self.scheduling
            + self.conditions
            + self.sensors
            + self.memory_reads
            + self.memory_writes
            + self.actions
            + self.messages
            + self.transfers
            + self.checking
            + self.draining
            + self.copying
            + self.construction
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Signal {
    pub id: u64,
    pub link: u16,
    pub from: Endpoint,
    pub to_cell: u16,
    pub to_port: u8,
    pub bit: bool,
    pub sent_tick: u32,
    pub deliver_tick: u32,
    pub receipt_spark: Option<u32>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CellState {
    pub id: u16,
    pub position: Point,
    pub heading: Direction,
    pub memory: [u8; 4],
    pub evidence: [Option<u32>; 4],
    pub cargo: Option<Spark>,
    pub inbox: [Option<Signal>; 4],
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub material: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub part: Option<u32>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SourceState {
    pub id: u16,
    pub sparks: Vec<Spark>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DepotState {
    pub id: u16,
    pub sparks: Vec<Spark>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BeaconState {
    pub id: u16,
    pub charge: u32,
    pub delivered: u32,
    pub drained: u32,
    pub exhausted: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EnabledState {
    pub id: u16,
    pub enabled: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Delivery {
    pub tick: u32,
    pub spark: Spark,
    pub beacon: u16,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct State {
    pub tick: u32,
    pub cells: Vec<CellState>,
    pub sources: Vec<SourceState>,
    pub depots: Vec<DepotState>,
    pub beacons: Vec<BeaconState>,
    pub valves: Vec<EnabledState>,
    pub links: Vec<EnabledState>,
    pub pending: Vec<Signal>,
    pub delivered: Vec<Delivery>,
    pub next_signal: u64,
    /// Omitted in legacy receipts so habitat-v1 bytes and identities stay unchanged.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub closed_edges: Vec<Edge>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub construction: Option<ConstructionState>,
    /// Declared facilities plus sites admitted by living-world commands.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub facilities: Vec<FacilityState>,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Activation {
    pub cell: u16,
    pub rule: Option<usize>,
    pub action: Action,
    pub success: bool,
    pub error: Option<String>,
    pub position_before: Point,
    pub position_after: Point,
    pub work_before: u64,
    pub work_after: u64,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SignalEvent {
    pub signal: Signal,
    pub outcome: String,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Frame {
    pub tick: u32,
    pub complete: bool,
    pub events: Vec<EventKind>,
    pub signals: Vec<SignalEvent>,
    pub activations: Vec<Activation>,
    pub state: State,
    pub costs: Costs,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Complete,
    FuelExhausted,
    ActivationLimit,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Outcome {
    pub all_beacons_positive: bool,
    pub quotas_met: bool,
    pub conserved: bool,
    pub passed: bool,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RunResult {
    pub protocol: String,
    pub status: RunStatus,
    pub ticks_completed: u32,
    pub initial_sparks: u32,
    pub costs: Costs,
    pub outcome: Outcome,
    pub frames: Vec<Frame>,
    pub final_state: State,
}
