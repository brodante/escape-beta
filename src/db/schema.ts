import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Rooms: one row per game instance ("session"). `state` holds the full
// authoritative GameState snapshot (JSON) for the scenario engine so that a
// room can be rehydrated on any server process after a restart or when a
// different Node instance picks up the socket connection behind a load
// balancer.
// ---------------------------------------------------------------------------
export const rooms = pgTable("rooms", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  scenarioId: text("scenario_id").notNull(),
  levelIndex: integer("level_index").notNull().default(0),
  status: text("status").notNull().default("lobby"), // lobby | active | won | lost
  state: jsonb("state").notNull().default({}),
  hostName: text("host_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Players: persisted roster per room. Socket connections are ephemeral and
// tracked in-memory, but the player row + role assignment survives
// reconnects/refreshes.
// ---------------------------------------------------------------------------
export const players = pgTable("players", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role"),
  isHost: boolean("is_host").notNull().default(false),
  connected: boolean("connected").notNull().default(false),
  score: integer("score").notNull().default(0),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Action log: append-only audit trail of every action request the
// authoritative server received, whether it was accepted or rejected, and
// why. Critical for the CTF/cybersecurity mode where trust and traceability
// matter, and invaluable for anti-cheat forensics + analytics generally.
// ---------------------------------------------------------------------------
export const actionLogs = pgTable("action_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  roomId: uuid("room_id")
    .notNull()
    .references(() => rooms.id, { onDelete: "cascade" }),
  playerId: uuid("player_id").references(() => players.id, { onDelete: "set null" }),
  actionType: text("action_type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  accepted: boolean("accepted").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
