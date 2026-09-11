import { customAlphabet } from "nanoid";
import { eq } from "drizzle-orm";
import { db, dbReady } from "@/db";
import { actionLogs, players as playersTable, rooms as roomsTable } from "@/db/schema";
import { getScenario } from "@/server/scenarios";
import type { InternalData, ScenarioPlayer } from "@/server/scenarios/types";
import { getPublisher } from "./pubsub";
import type {
  ActionRequest,
  ActionResult,
  FeedEntry,
  GameState,
  PlayerPublic,
  RoomSnapshot,
  RoomStatus,
  ScenarioId,
} from "@/lib/types";

const nanoid = customAlphabet("ABCDEFGHJKLMNPQRSTUVWXYZ23456789", 5);

export interface PlayerRuntime {
  id: string;
  name: string;
  role: string | null;
  isHost: boolean;
  connected: boolean;
  score: number;
  socketIds: Set<string>;
}

export interface RoomRuntime {
  code: string;
  roomId: string;
  scenarioId: ScenarioId;
  levelIndex: number;
  status: RoomStatus;
  data: InternalData;
  feed: FeedEntry[];
  players: Map<string, PlayerRuntime>;
  updatedAt: number;
}

const globalForRooms = globalThis as typeof globalThis & {
  __escapeRoomRuntime?: Map<string, RoomRuntime>;
};

const cache = globalForRooms.__escapeRoomRuntime ?? new Map<string, RoomRuntime>();
globalForRooms.__escapeRoomRuntime = cache;

function feedId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function rowToRuntime(row: typeof roomsTable.$inferSelect, playerRows: (typeof playersTable.$inferSelect)[]): RoomRuntime {
  const stored = (row.state as { data?: InternalData; feed?: FeedEntry[] }) ?? {};
  const scenario = getScenario(row.scenarioId);
  const data = stored.data ?? scenario.createInitialData(row.levelIndex);
  const feed = stored.feed ?? [];
  const players = new Map<string, PlayerRuntime>();
  for (const p of playerRows) {
    players.set(p.id, {
      id: p.id,
      name: p.name,
      role: p.role,
      isHost: p.isHost,
      connected: false,
      score: p.score,
      socketIds: new Set(),
    });
  }
  return {
    code: row.code,
    roomId: row.id,
    scenarioId: row.scenarioId as ScenarioId,
    levelIndex: row.levelIndex,
    status: row.status as RoomStatus,
    data,
    feed,
    players,
    updatedAt: row.updatedAt.getTime(),
  };
}

async function loadFromDb(code: string): Promise<RoomRuntime | null> {
  const [row] = await db.select().from(roomsTable).where(eq(roomsTable.code, code)).limit(1);
  if (!row) return null;
  const playerRows = await db.select().from(playersTable).where(eq(playersTable.roomId, row.id));
  const runtime = rowToRuntime(row, playerRows);
  cache.set(code, runtime);
  return runtime;
}

export async function getRoom(code: string): Promise<RoomRuntime | null> {
  const upper = code.toUpperCase();
  return cache.get(upper) ?? (await loadFromDb(upper));
}

async function persist(room: RoomRuntime) {
  room.updatedAt = Date.now();
  await db
    .update(roomsTable)
    .set({
      status: room.status,
      levelIndex: room.levelIndex,
      state: { data: room.data, feed: room.feed },
      updatedAt: new Date(),
    })
    .where(eq(roomsTable.id, room.roomId));
}

export async function createRoom(scenarioId: ScenarioId, hostName: string) {
  const scenario = getScenario(scenarioId);
  const data = scenario.createInitialData(0);
  let code = nanoid();
  // Extremely unlikely collision loop, but guard anyway.
  for (let i = 0; i < 5; i++) {
    const [existing] = await db.select({ id: roomsTable.id }).from(roomsTable).where(eq(roomsTable.code, code)).limit(1);
    if (!existing) break;
    code = nanoid();
  }
  const [row] = await db
    .insert(roomsTable)
    .values({
      code,
      scenarioId,
      levelIndex: 0,
      status: "lobby",
      state: { data, feed: [] },
      hostName,
    })
    .returning();

  const [playerRow] = await db
    .insert(playersTable)
    .values({ roomId: row.id, name: hostName, isHost: true, connected: false })
    .returning();

  const runtime = rowToRuntime(row, [playerRow]);
  cache.set(row.code, runtime);
  return { code: row.code, playerId: playerRow.id };
}

export async function joinRoom(code: string, name: string, existingPlayerId?: string) {
  const room = await getRoom(code);
  if (!room) return { ok: false as const, error: "Room not found." };

  if (existingPlayerId && room.players.has(existingPlayerId)) {
    const player = room.players.get(existingPlayerId)!;
    player.name = name || player.name;
    await db.update(playersTable).set({ name: player.name, lastSeenAt: new Date() }).where(eq(playersTable.id, player.id));
    return { ok: true as const, room, playerId: player.id };
  }

  if (room.status !== "lobby") {
    return { ok: false as const, error: "This room already started. Ask the host for a new room." };
  }

  const [playerRow] = await db
    .insert(playersTable)
    .values({ roomId: room.roomId, name, isHost: room.players.size === 0 })
    .returning();

  room.players.set(playerRow.id, {
    id: playerRow.id,
    name: playerRow.name,
    role: null,
    isHost: playerRow.isHost,
    connected: false,
    score: 0,
    socketIds: new Set(),
  });

  return { ok: true as const, room, playerId: playerRow.id };
}

export function attachSocket(room: RoomRuntime, playerId: string, socketId: string) {
  const player = room.players.get(playerId);
  if (!player) return;
  player.connected = true;
  player.socketIds.add(socketId);
  void db.update(playersTable).set({ connected: true, lastSeenAt: new Date() }).where(eq(playersTable.id, playerId));
}

export function detachSocket(room: RoomRuntime, playerId: string, socketId: string) {
  const player = room.players.get(playerId);
  if (!player) return;
  player.socketIds.delete(socketId);
  if (player.socketIds.size === 0) {
    player.connected = false;
    void db.update(playersTable).set({ connected: false, lastSeenAt: new Date() }).where(eq(playersTable.id, playerId));
  }
}

export async function selectRole(room: RoomRuntime, playerId: string, role: string): Promise<ActionResult> {
  const scenario = getScenario(room.scenarioId);
  if (!scenario.roles.some((r) => r.id === role)) {
    return { accepted: false, reason: "Unknown role for this scenario." };
  }
  const taken = [...room.players.values()].some((p) => p.id !== playerId && p.role === role && p.connected);
  if (taken) {
    return { accepted: false, reason: "That role is already taken by another connected player." };
  }
  const player = room.players.get(playerId);
  if (!player) return { accepted: false, reason: "Player not found." };
  if (room.status !== "lobby") return { accepted: false, reason: "Roles can only be changed in the lobby." };
  player.role = role;
  await db.update(playersTable).set({ role }).where(eq(playersTable.id, playerId));
  pushFeed(room, { message: `${player.name} is now the ${scenario.roles.find((r) => r.id === role)?.name}.`, tone: "info" });
  await persist(room);
  await getPublisher().publish({ code: room.code });
  return { accepted: true };
}

export async function startGame(room: RoomRuntime, playerId: string): Promise<ActionResult> {
  const player = room.players.get(playerId);
  if (!player) return { accepted: false, reason: "Player not found." };
  if (!player.isHost) return { accepted: false, reason: "Only the host can start the game." };
  if (room.status !== "lobby") return { accepted: false, reason: "Game already started." };
  const connectedPlayers = [...room.players.values()].filter((p) => p.connected);
  if (connectedPlayers.some((p) => !p.role)) {
    return { accepted: false, reason: "Every connected player must pick a role first." };
  }
  if (connectedPlayers.length < 1) {
    return { accepted: false, reason: "Need at least one player to start." };
  }
  room.status = "active";
  pushFeed(room, { message: "The scenario begins. Good luck!", tone: "info" });
  await persist(room);
  await getPublisher().publish({ code: room.code });
  return { accepted: true };
}

function pushFeed(room: RoomRuntime, entry: { message: string; tone?: FeedEntry["tone"]; actor?: string }) {
  room.feed.push({ id: feedId(), ts: Date.now(), message: entry.message, tone: entry.tone ?? "info", actor: entry.actor });
  if (room.feed.length > 50) room.feed.shift();
}

export async function applyAction(room: RoomRuntime, playerId: string, action: ActionRequest): Promise<ActionResult> {
  const player = room.players.get(playerId);
  if (!player) return { accepted: false, reason: "Player not found." };
  if (room.status !== "active") return { accepted: false, reason: "The game is not active." };

  const scenario = getScenario(room.scenarioId);
  const scenarioPlayer: ScenarioPlayer = { id: player.id, name: player.name, role: player.role };
  const allPlayers: ScenarioPlayer[] = [...room.players.values()].map((p) => ({ id: p.id, name: p.name, role: p.role }));

  const outcome = scenario.applyAction({ data: room.data, player: scenarioPlayer, players: allPlayers, levelIndex: room.levelIndex, action });

  if (!outcome.ok) {
    await db.insert(actionLogs).values({
      roomId: room.roomId,
      playerId: player.id,
      actionType: action.type,
      payload: action.payload ?? {},
      accepted: false,
      reason: outcome.reason,
    });
    return { accepted: false, reason: outcome.reason };
  }

  if (outcome.patch?.pub) room.data.pub = { ...room.data.pub, ...outcome.patch.pub };
  if (outcome.patch?.secrets) room.data.secrets = { ...room.data.secrets, ...outcome.patch.secrets };
  if (outcome.patch?.roleOnly) {
    room.data.roleOnly = { ...(room.data.roleOnly ?? {}) };
    for (const [role, patch] of Object.entries(outcome.patch.roleOnly)) {
      room.data.roleOnly[role] = { ...(room.data.roleOnly[role] ?? {}), ...patch };
    }
  }
  for (const entry of outcome.feed ?? []) pushFeed(room, entry);
  if (outcome.status) room.status = outcome.status;

  await db.insert(actionLogs).values({
    roomId: room.roomId,
    playerId: player.id,
    actionType: action.type,
    payload: action.payload ?? {},
    accepted: true,
  });

  await persist(room);
  await getPublisher().publish({ code: room.code });

  return { accepted: true };
}

export function sanitizeState(room: RoomRuntime, viewerRole: string | null): GameState {
  const roleData = viewerRole ? room.data.roleOnly?.[viewerRole] : undefined;
  return {
    scenarioId: room.scenarioId,
    levelIndex: room.levelIndex,
    status: room.status,
    data: { ...room.data.pub, ...(roleData ?? {}) },
    feed: room.feed,
    updatedAt: room.updatedAt,
  };
}

export function playersPublic(room: RoomRuntime): PlayerPublic[] {
  return [...room.players.values()]
    .sort((a, b) => (a.isHost === b.isHost ? 0 : a.isHost ? -1 : 1))
    .map((p) => ({ id: p.id, name: p.name, role: p.role, connected: p.connected, isHost: p.isHost, score: p.score }));
}

export function toSnapshot(room: RoomRuntime, viewerRole: string | null): RoomSnapshot {
  return {
    code: room.code,
    scenarioId: room.scenarioId,
    status: room.status,
    levelIndex: room.levelIndex,
    players: playersPublic(room),
    state: sanitizeState(room, viewerRole),
  };
}

export function invalidateCache(code: string) {
  cache.delete(code.toUpperCase());
}
