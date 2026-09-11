import type {
  ActionRequest,
  FeedEntry,
  LevelDefinition,
  RoleDefinition,
  RoomStatus,
  ScenarioId,
} from "@/lib/types";

/**
 * Internal (server-only) shape of `GameState.data`. Every scenario module
 * stores its puzzle content in one of three buckets so the engine can
 * uniformly decide what to ship to which client, WITHOUT any scenario having
 * to hand-roll its own redaction logic:
 *
 *  - `pub`      -> sent to every connected player as-is.
 *  - `roleOnly` -> `roleOnly[roleId]` is merged in only for players who hold
 *                  that role (e.g. only the Cryptographer sees the raw
 *                  ciphertext workspace).
 *  - `secrets`  -> NEVER leaves the server. Solutions, correct answers,
 *                  correct ports/IPs/flags all live here. This is what makes
 *                  the server authoritative: the client literally cannot
 *                  inspect network traffic to find the answer.
 */
export interface InternalData {
  pub: Record<string, unknown>;
  roleOnly?: Record<string, Record<string, unknown>>;
  secrets: Record<string, unknown>;
}

export interface ScenarioPlayer {
  id: string;
  name: string;
  role: string | null;
}

export interface ScenarioActionOutcome {
  ok: boolean;
  reason?: string;
  patch?: {
    pub?: Record<string, unknown>;
    roleOnly?: Record<string, Record<string, unknown>>;
    secrets?: Record<string, unknown>;
  };
  feed?: Array<{ message: string; tone?: FeedEntry["tone"]; actor?: string }>;
  status?: RoomStatus;
};

export interface ScenarioModule {
  id: ScenarioId;
  name: string;
  description: string;
  roles: RoleDefinition[];
  levels: LevelDefinition[];
  createInitialData(levelIndex: number): InternalData;
  applyAction(ctx: {
    data: InternalData;
    player: ScenarioPlayer;
    players: ScenarioPlayer[];
    levelIndex: number;
    action: ActionRequest;
  }): ScenarioActionOutcome;
}
