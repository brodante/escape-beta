import { getRoom, toSnapshot } from "@/server/engine/roomManager";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const room = await getRoom(code);
  if (!room) return Response.json({ error: "Room not found." }, { status: 404 });
  return Response.json(toSnapshot(room, null));
}
