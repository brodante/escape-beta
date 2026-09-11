import type { Server as HTTPServer } from "http";
import { Server as SocketIOServer, type Socket } from "socket.io";
import {
  applyAction,
  attachSocket,
  createRoom as createRoomRuntime,
  detachSocket,
  getRoom,
  joinRoom as joinRoomRuntime,
  selectRole,
  startGame,
  toSnapshot,
  type RoomRuntime,
} from "./roomManager";
import { getPublisher } from "./pubsub";
import type { ClientToServerEvents, ServerToClientEvents } from "@/lib/types";

export const SOCKET_PATH = "/api/socket";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface SocketData {
  code?: string;
  playerId?: string;
}

function broadcastRoom(io: SocketIOServer, room: RoomRuntime) {
  const socketsInRoom = io.sockets.adapter.rooms.get(room.code);
  if (!socketsInRoom) return;
  for (const socketId of socketsInRoom) {
    const socket = io.sockets.sockets.get(socketId) as AppSocket | undefined;
    if (!socket) continue;
    const data = socket.data as SocketData;
    const playerId = data.playerId;
    const player = playerId ? room.players.get(playerId) : undefined;
    socket.emit("room:state", toSnapshot(room, player?.role ?? null));
  }
}

async function broadcastByCode(io: SocketIOServer, code: string) {
  const room = await getRoom(code);
  if (room) broadcastRoom(io, room);
}

let bootstrapped = false;

export function ensureSocketServer(httpServer: HTTPServer): SocketIOServer {
  const globalForIo = globalThis as typeof globalThis & { __escapeRoomIo?: SocketIOServer };
  if (globalForIo.__escapeRoomIo) return globalForIo.__escapeRoomIo;

  const io = new SocketIOServer(httpServer, {
    path: SOCKET_PATH,
    addTrailingSlash: false,
    cors: { origin: "*" },
  });

  if (!bootstrapped) {
    bootstrapped = true;
    getPublisher().subscribe((msg) => {
      void broadcastByCode(io, msg.code);
    });
  }

  io.on("connection", (socket: AppSocket) => {
    socket.data.code = undefined;
    socket.data.playerId = undefined;

    socket.on("room:join", async (payload, ack) => {
      try {
        const code = String(payload.code || "").toUpperCase();
        const name = String(payload.name || "Player").slice(0, 24);
        if (!code) return ack({ ok: false, error: "Room code is required." });

        const result = await joinRoomRuntime(code, name, payload.playerId);
        if (!result.ok) return ack({ ok: false, error: result.error });

        const { room, playerId } = result;
        socket.data.code = code;
        socket.data.playerId = playerId;
        socket.join(code);
        attachSocket(room, playerId, socket.id);

        const player = room.players.get(playerId);
        ack({ ok: true, snapshot: toSnapshot(room, player?.role ?? null), playerId });
        broadcastRoom(io, room);
        await getPublisher().publish({ code });
      } catch (err) {
        console.error("room:join failed", err);
        ack({ ok: false, error: "Unexpected server error while joining the room." });
      }
    });

    socket.on("role:select", async (payload, ack) => {
      const { code, playerId } = socket.data as SocketData;
      if (!code || !playerId) return ack({ accepted: false, reason: "Not joined to a room." });
      const room = await getRoom(code);
      if (!room) return ack({ accepted: false, reason: "Room not found." });
      const result = await selectRole(room, playerId, payload.role);
      ack(result);
      if (result.accepted) broadcastRoom(io, room);
    });

    socket.on("game:start", async (ack) => {
      const { code, playerId } = socket.data as SocketData;
      if (!code || !playerId) return ack({ accepted: false, reason: "Not joined to a room." });
      const room = await getRoom(code);
      if (!room) return ack({ accepted: false, reason: "Room not found." });
      const result = await startGame(room, playerId);
      ack(result);
      if (result.accepted) broadcastRoom(io, room);
    });

    socket.on("game:action", async (payload, ack) => {
      const { code, playerId } = socket.data as SocketData;
      if (!code || !playerId) return ack({ accepted: false, reason: "Not joined to a room." });
      const room = await getRoom(code);
      if (!room) return ack({ accepted: false, reason: "Room not found." });
      const result = await applyAction(room, playerId, payload);
      ack(result);
      if (result.accepted) broadcastRoom(io, room);
    });

    socket.on("disconnect", async () => {
      const { code, playerId } = socket.data as SocketData;
      if (!code || !playerId) return;
      const room = await getRoom(code);
      if (!room) return;
      detachSocket(room, playerId, socket.id);
      broadcastRoom(io, room);
      await getPublisher().publish({ code });
    });
  });

  globalForIo.__escapeRoomIo = io;
  return io;
}

export { createRoomRuntime };
