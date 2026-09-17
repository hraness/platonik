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

Every action and unmatched rule costs modeled work; fuel is finite. Sparks conserve; walls block; messages arrive on inbox ports.`;
