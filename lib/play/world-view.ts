import type { Frame } from "../bridge/types";
import type { FacilityDiagnostic, ItemAmount, WorldReport } from "./engine";

export const CELL_NAMES: Record<number, string> = { 1: "Moth", 2: "Ant", 3: "Moss", 4: "Lark", 5: "Foundry", 6: "Flint" };
const FACILITY_NAMES: Record<number, string> = { 90: "Fabricator", 91: "Storehouse", 92: "Drill", 93: "Assembler" };
export const FACILITY_LABELS: Record<string, string> = {
  fabricator: "Fabricator", storehouse: "Storehouse", miner: "Drill", assembler: "Assembler", crane: "Crane",
};

export function facilityName(id: number, names: Record<string, string>): string {
  return names[String(id)] ?? FACILITY_NAMES[id] ?? `Facility ${id}`;
}

export function itemList(items: ItemAmount[]): string {
  return items.map(({ item, quantity }) => `${quantity} ${item}${quantity === 1 ? "" : "s"}`).join(" + ");
}

export function facilityStatus(diagnostic: FacilityDiagnostic): string {
  switch (diagnostic.status) {
    case "construction": return `Needs ${itemList(diagnostic.missing_inputs)}`;
    case "working": return "Working";
    case "waiting_inputs": return `Waiting for ${itemList(diagnostic.missing_inputs)}`;
    case "output_full": return "Output buffer full";
    case "exhausted": return "Deposit empty";
    case "ready": return "Ready to work";
    case "storage": return "Storage";
    case "waiting_transfer": return "No transfer available";
    case "mint_limit": return "Production limit reached";
  }
}

/** Add a display-only settled view after a no-time intervention, never a simulation tick. */
export function worldViews(report: WorldReport): { frame: Frame; industry: FacilityDiagnostic[]; current: boolean }[] {
  const views = report.recent_frames.map((frame, index) => ({
    frame, industry: report.industry_frames[index]?.facilities ?? [], current: false,
  }));
  const last = views.at(-1);
  if (!last || JSON.stringify(last.frame.state) !== JSON.stringify(report.state)) {
    views.push({
      frame: { tick: report.tick, complete: true, state: report.state, costs: report.costs, events: [], signals: [], activations: [] },
      industry: report.industry, current: true,
    });
  } else {
    last.current = true;
    last.industry = report.industry;
  }
  return views;
}
