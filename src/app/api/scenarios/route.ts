import { SCENARIO_REGISTRY } from "@/server/scenarios";

export const dynamic = "force-dynamic";

export async function GET() {
  const scenarios = Object.values(SCENARIO_REGISTRY).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    roles: s.roles,
    levels: s.levels,
  }));
  return Response.json(scenarios);
}
