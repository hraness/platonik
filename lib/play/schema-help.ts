// Compact program-format reference embedded in agent prompts and editor help.
// Keep in sync with crates/platonik-core/src/model.rs Condition/Action shapes.

export const PROGRAM_SCHEMA_HELP = `A program is {"rules": [...]} — 1–32 rules, evaluated in order; the first rule whose "when" conditions all hold fires its "action".

Rule: {"when": [condition, ...], "action": action, "remember": {"slot": 0-3, "value": 0-255} | null}

Conditions (all must hold; up to 8 per rule):
  {"kind":"carrying","value":bool}          — cell holds a spark
  {"kind":"at_source","value":bool}         — standing on a source
  {"kind":"at_depot","value":bool}          — standing on a depot
  {"kind":"at_beacon","value":bool}         — standing on a beacon
  {"kind":"at_receiver","value":bool}       — standing on a receiver
  {"kind":"blocked","direction":"forward|left|right|back","value":bool}
  {"kind":"has_message","port":0-3,"value":bool}
  {"kind":"message_bit","port":0-3,"value":bool}
  {"kind":"memory","slot":0-3,"value":0-255}— memory slot equals value
  {"kind":"heading","direction":"north|east|south|west"}
  {"kind":"has_material","value":bool}
  {"kind":"assembly_stage","blueprint":N,"stage":"absent|copying|wiring|ready|born"}
  {"kind":"assembly_edits","blueprint":N,"count":0-8}
  {"kind":"has_part","value":bool}           — cell holds a minted part
  {"kind":"at_stock","value":bool}          — standing on a material deposit
  {"kind":"at_facility","value":bool}       — standing on a facility or site
  {"kind":"facility_ready","value":bool}    — the facility here finished its bill
  {"kind":"facility_needs","item":"spark|material|part","value":bool}
  {"kind":"facility_has","item":"spark|material|part","value":bool}
  {"kind":"facility_is","structure":"fabricator|storehouse|miner","value":bool}

Actions:
  {"kind":"move","direction":"forward|left|right|back"}
  {"kind":"turn","direction":"forward|left|right|back"}
  {"kind":"pickup"} / {"kind":"drop"} / {"kind":"wait"}
  {"kind":"write_memory","slot":0-3,"value":0-255}
  {"kind":"take_message","port":0-3,"slot":0-3}
  {"kind":"send","port":0-3,"bit":{"kind":"constant","value":bool}|{"kind":"memory","slot":0-3}|{"kind":"message","port":0-3}}
  {"kind":"route","valve":N,"bit":BitSource}
  {"kind":"gather_material","stock":N}
  {"kind":"build","blueprint":N} / {"kind":"activate","blueprint":N}
  {"kind":"edit_direction","blueprint":N,"rule":0-31,"slot":0-7}
  {"kind":"gather"}                          — take one material from the deposit here
  {"kind":"supply","item":"spark|material|part"}  — give the facility here one item
  {"kind":"fetch","item":"spark|material|part"}   — take one item from the facility here

Every action and unmatched rule costs modeled work; fuel is finite. Sparks, material, and parts conserve; walls block; messages arrive on inbox ports. Facilities tick once per world tick: a ready fabricator burns 1 material + 1 spark over 6 ticks to mint a unique part; a ready drill pulls 1 material from its deposit every 12 ticks (drills only place on deposits); a site becomes ready when its bill is supplied.`;
