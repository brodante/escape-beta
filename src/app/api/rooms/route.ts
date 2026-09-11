import { createRoom } from "@/server/engine/roomManager";
import { SCENARIO_REGISTRY } from "@/server/scenarios";
import type { ScenarioId } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { scenarioId?: string; hostName?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const scenarioId = body.scenarioId as ScenarioId | undefined;
  const hostName = (body.hostName ?? "").trim().slice(0, 24);

  if (!scenarioId || !SCENARIO_REGISTRY[scenarioId]) {
    return Response.json({ error: "Unknown or missing scenarioId." }, { status: 400 });
  }
  if (!hostName) {
    return Response.json({ error: "hostName is required." }, { status: 400 });
  }

  try {
    const { code, playerId } = await createRoom(scenarioId, hostName);
    return Response.json({ code, playerId });
  } catch (err) {
    console.error("Failed to create room", err);
    return Response.json({ error: "Failed to create room." }, { status: 500 });
  }
}
