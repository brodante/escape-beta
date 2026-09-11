import type { LevelDefinition, RoleDefinition, ScenarioId } from "@/lib/types";

export interface ScenarioMeta {
  id: ScenarioId;
  name: string;
  description: string;
  roles: RoleDefinition[];
  levels: LevelDefinition[];
}

export async function fetchScenarios(): Promise<ScenarioMeta[]> {
  const res = await fetch("/api/scenarios", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load scenarios");
  return res.json();
}
