import type { ScenarioId } from "@/lib/types";
import type { ScenarioModule } from "./types";
import { adventureScenario } from "./adventure";
import { cybersecurityScenario } from "./cybersecurity";
import { biologyScenario } from "./biology";

// ---------------------------------------------------------------------------
// The scenario registry. Adding a brand new mode (e.g. "math") means writing
// one new file that satisfies `ScenarioModule` and adding a single line here
// — nothing in the networking layer, room manager, or client shell needs to
// change. This is the crux of "modular scenario design" from the spec.
// ---------------------------------------------------------------------------
export const SCENARIO_REGISTRY: Record<ScenarioId, ScenarioModule> = {
  adventure: adventureScenario,
  cybersecurity: cybersecurityScenario,
  biology: biologyScenario,
};

export function getScenario(id: string): ScenarioModule {
  const scenario = SCENARIO_REGISTRY[id as ScenarioId];
  if (!scenario) throw new Error(`Unknown scenario "${id}"`);
  return scenario;
}

export type { ScenarioModule } from "./types";
