// ---------------------------------------------------------------------------
// Shared core types for the Asymmetric Multi-Mode Escape Room engine.
// These types are imported by both the Socket.IO server code (src/server/**)
// and the React client (src/app/**, src/components/**) so the wire format
// never drifts between the two.
// ---------------------------------------------------------------------------

export type ScenarioId = "adventure" | "cybersecurity" | "biology";

export type RoomStatus = "lobby" | "active" | "won" | "lost";

/** A role a player can pick within a given scenario. */
export interface RoleDefinition {
  id: string;
  name: string;
  tagline: string;
  color: string;
  /** Emoji/icon shown in the UI. */
  icon: string;
  /** Human readable description of what this role can uniquely do. */
  abilities: string[];
}

/** A single step/level of difficulty progression within a scenario. */
export interface LevelDefinition {
  index: number;
  name: string;
  briefing: string;
  /** Minimum number of distinct roles recommended to attempt this level. */
  recommendedPlayers: number;
}

export interface PlayerPublic {
  id: string;
  name: string;
  role: string | null;
  connected: boolean;
  isHost: boolean;
  score: number;
}

/** Generic authoritative game state. `data` is scenario-specific. */
export interface GameState {
  scenarioId: ScenarioId;
  levelIndex: number;
  status: RoomStatus;
  /** Free-form, scenario-owned puzzle state (fragments found, gauges, logs…). */
  data: Record<string, unknown>;
  /** Rolling activity log shown to all players (system + puzzle feed). */
  feed: FeedEntry[];
  updatedAt: number;
}

export interface FeedEntry {
  id: string;
  ts: number;
  actor?: string;
  message: string;
  tone: "info" | "success" | "warning" | "danger";
}

export interface RoomSnapshot {
  code: string;
  scenarioId: ScenarioId;
  status: RoomStatus;
  levelIndex: number;
  players: PlayerPublic[];
  state: GameState;
}

/** Action request sent from client -> server. Server is fully authoritative. */
export interface ActionRequest {
  type: string;
  payload?: Record<string, unknown>;
}

export interface ActionResult {
  accepted: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Socket.IO event dictionary (typed) - see docs/TECHNICAL_DESIGN.md section C
// ---------------------------------------------------------------------------

export interface ServerToClientEvents {
  "room:state": (snapshot: RoomSnapshot) => void;
  "room:error": (message: string) => void;
  "action:result": (result: ActionResult & { type: string }) => void;
}

export interface ClientToServerEvents {
  "room:join": (
    payload: { code: string; name: string; playerId?: string },
    ack: (res: { ok: true; snapshot: RoomSnapshot; playerId: string } | { ok: false; error: string }) => void,
  ) => void;
  "role:select": (payload: { role: string }, ack: (res: ActionResult) => void) => void;
  "game:start": (ack: (res: ActionResult) => void) => void;
  "game:action": (payload: ActionRequest, ack: (res: ActionResult) => void) => void;
}

export const SCENARIOS: Array<{ id: ScenarioId; name: string; tagline: string; theme: string }> = [
  {
    id: "adventure",
    name: "Adventure Mode",
    tagline: "Classic escape room: keys, ciphers, and locked doors.",
    theme: "from-amber-500 to-orange-700",
  },
  {
    id: "cybersecurity",
    name: "Cybersecurity Mode",
    tagline: "CTF-style: scan, patch, decrypt, and capture the flag.",
    theme: "from-emerald-500 to-teal-700",
  },
  {
    id: "biology",
    name: "Biology / Medical Mode",
    tagline: "Outbreak response: sequence, stabilize, and synthesize a cure.",
    theme: "from-rose-500 to-fuchsia-700",
  },
];
