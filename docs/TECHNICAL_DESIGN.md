# Nexus Protocol — Technical Design Document
### Asymmetric Multi-Mode Escape Room Engine

**Author:** Principal Game Architect (AI Agent)
**Status:** MVP implemented in this repository. Production-scale notes included for the next phases.

---

## 0. What is actually running in this repo

This repo ships a **working, playable slice** of the architecture described below so the design isn't
just theoretical:

- A single Next.js app (App Router) that serves the UI, REST endpoints, and a Socket.IO server
  (via `src/pages/api/socket.ts`, the one file that has to live in the Pages Router because it needs
  raw access to the underlying Node `http.Server` — App Router Route Handlers use the Web Fetch API and
  can't do this without a custom server).
- Three fully playable scenario modules — **Adventure**, **Cybersecurity (CTF)**, and **Biology/Medical**
  — each with 4 asymmetric roles, 2 difficulty levels, and a server-authoritative win/lose condition.
- Postgres (via Drizzle ORM) for durable state: rooms, players, and an append-only action audit log.
- A Redis pub/sub abstraction (`src/server/engine/pubsub.ts`) that transparently uses real Redis when
  `REDIS_URL` is set, and an in-process `EventEmitter` otherwise (this sandbox has no Redis instance) —
  every call-site is identical either way, so flipping on horizontal scaling is a config change, not a
  code change.

Directory map for the implementation:

```
src/
  db/schema.ts                 rooms, players, action_logs tables
  lib/types.ts                 shared wire types + Socket.IO event dictionary
  lib/scenarioMeta.ts          client helper to fetch scenario/role metadata
  server/scenarios/*.ts        pluggable scenario modules (adventure/cybersecurity/biology)
  server/engine/roomManager.ts authoritative game engine (validation, state mutation, persistence)
  server/engine/pubsub.ts      Redis (or in-memory) cross-instance fan-out
  server/engine/socketServer.ts Socket.IO wiring: events <-> engine
  pages/api/socket.ts          bootstraps the Socket.IO server on the Next.js HTTP server
  app/api/rooms, /scenarios    REST endpoints (create room, fetch scenario catalog)
  app/room/[code]              the room/lobby/game UI (client components)
  components/scenarios/*.tsx   mode-specific UI (Adventure/Cyber/Biology views)
```

---

## A. System Architecture & Infrastructure Flow

### A.1 Target production topology

```
                         ┌────────────────────┐
                         │   CDN / Edge (Next  │
                         │   static assets)    │
                         └─────────┬───────────┘
                                   │
                         ┌─────────▼───────────┐
                         │   Load Balancer /    │   L7, WebSocket-aware
                         │   Ingress (L7)        │   (ALB/NGINX/Traefik)
                         └───┬─────────────┬────┘
                    sticky?  │             │  sticky?
             ┌───────────────▼─┐        ┌──▼───────────────┐
             │ Next.js + Socket │  ...   │ Next.js + Socket │   N horizontally
             │ .IO instance #1  │        │ .IO instance #N  │   scaled Node
             │ (game engine)    │        │ (game engine)    │   processes
             └───┬─────────┬────┘        └───┬─────────┬────┘
                 │         │                 │         │
        Postgres │         │ Redis Pub/Sub   │         │
   (source of    │         │ (state fan-out  │         │
    truth: rooms,│         │  + presence +   │         │
    players,     │         │  Socket.IO      │         │
    action log)  │         │  adapter)       │         │
                 ▼         ▼                 ▼         ▼
         ┌───────────────┐   ┌───────────────────────┐
         │   PostgreSQL   │   │   Redis (Cluster)      │
         │ (Drizzle ORM)  │   │  - pub/sub channels     │
         └───────────────┘   │  - Socket.IO adapter    │
                              │  - ephemeral presence   │
                              └───────────────────────┘
```

**Why this shape:**

1. **Next.js handles both the UI and the stateless HTTP surface** (REST for room creation/lookup,
   scenario catalog, auth). These scale trivially behind any load balancer with no affinity
   requirements.
2. **Socket.IO instances are the stateful tier.** A given room's *live* runtime object
   (`RoomRuntime` in `roomManager.ts`) is cached in the memory of whichever process last handled it,
   but the **source of truth is Postgres**, and every mutation is immediately persisted and broadcast
   through Redis. This means:
   - If an instance restarts or a client's WebSocket reconnects to a different instance, the room can
     be rehydrated from Postgres with zero data loss.
   - Sticky sessions (recommended, via `Set-Cookie`/consistent hashing on room code) are a *performance*
     optimization, not a *correctness* requirement — every instance subscribes to Redis pub/sub and can
     serve any room. This is what makes it "authoritative + horizontally scalable" rather than one or the
     other.
3. **Redis plays two roles at production scale:**
   - **Socket.IO adapter** (`@socket.io/redis-adapter`) — lets `io.to(room).emit(...)` reach sockets that
     are connected to *other* processes, and enables `io.serverSideEmit` for cross-process coordination.
   - **Custom application pub/sub channel** (what's implemented here) — carries "room X's state changed,
     go reload it" messages so that any process holding sockets for room X re-reads the canonical state
     from Postgres (or a Redis-cached copy, see A.3) and re-broadcasts to its local sockets.
   In this repo both concerns are collapsed into `getPublisher()` for simplicity, but in production I'd
   run the official Redis adapter *and* this app-level channel side by side, because the adapter alone
   doesn't know about the authoritative-server business logic (permission checks, win conditions, etc.).
4. **PostgreSQL as system of record.** Escape-room state is bursty (lots of writes during an active
   session, close to zero once a room finishes) and needs durability for progression, analytics, and
   the anti-cheat audit trail. A relational DB with JSONB is the pragmatic choice: strongly-typed
   columns for things we query/join on (room code, scenario id, player roster, scores) and a flexible
   JSONB `state` column for the scenario-specific puzzle payload, which differs wildly between modes.

### A.2 Handling horizontal scaling

- **Stateless compute, stateful cache.** No in-memory data is ever the *only* copy — Postgres is
  authoritative, Redis is the fast fan-out layer, and each instance's memory is just a warm cache.
  This means we can autoscale Socket.IO instances up/down based on concurrent connections without a
  special draining protocol beyond "stop accepting new sockets, let existing ones finish or reconnect
  elsewhere."
- **Sticky routing by room code** (e.g. consistent hashing on `roomCode` at the ingress, or an
  `io-adapter`-aware LB) minimizes cross-instance chatter for the common case (all players of a room
  land on the same instance), while Redis pub/sub is the correctness fallback for the uncommon case
  (players split across instances, or a rolling deploy mid-session).
- **Separate the WebSocket tier from the Next.js render tier at real scale.** For an MVP, colocating
  Socket.IO inside the Next.js process (what this repo does) is the fastest path to a working product.
  Once concurrency grows, I would peel the realtime engine into its own Node service (still sharing the
  `server/engine` and `server/scenarios` packages via the monorepo, see section E) so that Next.js
  instances can scale independently for SSR/API load versus long-lived WebSocket connections, which have
  very different scaling characteristics (memory-per-connection vs. CPU-per-request).
- **Backpressure & abuse protection:** rate-limit `game:action` per socket (token bucket keyed by
  socket id + room), and cap room size server-side. Both are cheap additions to `socketServer.ts`.

### A.3 Where the "authoritative state" actually lives at scale

For very high concurrency, re-reading Postgres on every single action is unnecessary I/O. The
recommended evolution (not yet needed at MVP scale) is a write-through cache:

1. Action arrives at instance N.
2. Instance N reads current state from **Redis** (`room:{code}:state`, a JSON blob with an optimistic
   `version` field), not Postgres, for low latency.
3. Instance N runs the scenario reducer, does a Redis `WATCH`/`MULTI` (or a Lua script) compare-and-swap
   on `version` to avoid races if two instances raced on the same room.
4. On success, publish the new state to the pub/sub channel and asynchronously flush to Postgres
   (append to `action_logs` synchronously for audit integrity; batch/debounce the `rooms.state` snapshot
   write).

This repo's `roomManager.ts` is written so that swapping step 2/4 for a Redis-backed cache is a
localized change (`persist()` and `getRoom()` are the only functions that touch storage).

---

## B. Core Data Structures & State Management

All shared types live in `src/lib/types.ts`; scenario-internal types live in `src/server/scenarios/types.ts`.

```ts
export type ScenarioId = "adventure" | "cybersecurity" | "biology";
export type RoomStatus = "lobby" | "active" | "won" | "lost";

export interface RoleDefinition {
  id: string;
  name: string;
  tagline: string;
  color: string;
  icon: string;
  abilities: string[];
}

export interface LevelDefinition {
  index: number;
  name: string;
  briefing: string;
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

// The generic envelope every scenario shares:
export interface GameState {
  scenarioId: ScenarioId;
  levelIndex: number;
  status: RoomStatus;
  data: Record<string, unknown>;   // <-- scenario-owned payload
  feed: FeedEntry[];               // shared activity log, mode-agnostic
  updatedAt: number;
}

export interface RoomSnapshot {
  code: string;
  scenarioId: ScenarioId;
  status: RoomStatus;
  levelIndex: number;
  players: PlayerPublic[];
  state: GameState;                // PERSONALIZED per viewer, see below
}
```

### B.1 The trick that lets wildly different modes share one engine

Every scenario module owns `GameState.data`, but internally (server-side only, see
`server/scenarios/types.ts::InternalData`) it is split into three buckets:

```ts
interface InternalData {
  pub: Record<string, unknown>;                       // shipped to everyone
  roleOnly?: Record<string, Record<string, unknown>>;  // shipped only to that role
  secrets: Record<string, unknown>;                    // NEVER shipped to any client
}
```

The room manager's `sanitizeState()` flattens `pub + roleOnly[viewerRole]` into the `GameState.data`
that actually goes over the wire — and it does this **per socket**, not once per room. That's why
`RoomSnapshot` is described as "personalized": the Hacker's client and the Explorer's client can (and
in Cybersecurity mode, do) receive different `data` payloads for the exact same room, and the answer
keys never leave the server process at all. This single convention is what lets Adventure ("find 3
fragments"), Cybersecurity ("capture 4 flag fragments"), and Biology ("assemble 3 cure fragments") all
be expressed as the *same shape* of module without leaking puzzle solutions to curious players
poking at devtools/network tab — a hard requirement for the CTF mode in particular.

### B.2 The Scenario contract (the "plugin" interface)

```ts
export interface ScenarioModule {
  id: ScenarioId;
  name: string;
  description: string;
  roles: RoleDefinition[];
  levels: LevelDefinition[];
  createInitialData(levelIndex: number): InternalData;
  applyAction(ctx: {
    data: InternalData;
    player: { id: string; name: string; role: string | null };
    players: Array<{ id: string; name: string; role: string | null }>;
    levelIndex: number;
    action: { type: string; payload?: Record<string, unknown> };
  }): {
    ok: boolean;
    reason?: string;                                   // shown to the acting client only
    patch?: { pub?: object; roleOnly?: object; secrets?: object };
    feed?: Array<{ message: string; tone?: "info"|"success"|"warning"|"danger" }>;
    status?: RoomStatus;                                // set to "won"/"lost" to end the session
  };
}
```

A new mode (the spec's example: "Math Room") is implemented by writing one file that satisfies this
interface and registering it in `src/server/scenarios/index.ts::SCENARIO_REGISTRY`. **Nothing** in
`roomManager.ts`, `socketServer.ts`, the REST routes, or the room/lobby shell needs to change — only the
mode-specific React view component needs to be added and switched on in `RoomClient.tsx`, mirroring how
`AdventureView` / `CyberView` / `BiologyView` are selected today. This directly satisfies the "plugging
in a new scenario" modularity requirement.

### B.3 `Room` / `Player` persistence schema (Drizzle, Postgres)

```ts
rooms:       id (uuid pk), code (unique), scenario_id, level_index, status,
             state (jsonb: { data, feed }), host_name, created_at, updated_at

players:     id (uuid pk), room_id (fk), name, role, is_host, connected,
             score, joined_at, last_seen_at

action_logs: id (uuid pk), room_id (fk), player_id (fk, nullable),
             action_type, payload (jsonb), accepted (bool), reason, created_at
```

`action_logs` is the anti-cheat/forensics trail: **every** action request is recorded whether accepted
or rejected, with the reason for rejection. This is invaluable for the Cybersecurity mode specifically
(a rejected `patch_service` because the player wasn't the IT Sec Admin is itself a security-relevant
event worth keeping), and doubles as analytics data for balancing puzzle difficulty later.

---

## C. Networking & Event Dictionary

Socket.IO was chosen over raw WebSockets for: automatic reconnection with exponential backoff, room
abstraction (`socket.join(code)`), acknowledgement callbacks (critical for "request/response" style
authoritative actions), and transparent fallback to HTTP long-polling on hostile networks (many school
and corporate networks used in an educational CTF context block raw WS upgrades).

### C.1 Client → Server (**requests**, always via `ack` callback, never fire-and-forget)

| Event | Payload | Ack response | Notes |
|---|---|---|---|
| `room:join` | `{ code, name, playerId? }` | `{ ok, snapshot, playerId } \| { ok: false, error }` | `playerId` is echoed back from `localStorage` on reconnect so refreshing the page resumes the same seat. |
| `role:select` | `{ role }` | `ActionResult` (`{ accepted, reason? }`) | Rejected if role taken by another *connected* player, scenario doesn't have that role, or game already started. |
| `game:start` | — | `ActionResult` | Host-only; requires every connected player to have picked a role. |
| `game:action` | `{ type, payload }` | `ActionResult` | The **only** way puzzle state changes. Fully opaque to the transport layer — `type`/`payload` are scenario-defined strings the reducer interprets. |

### C.2 Server → Client (**broadcasts**, no ack, fan-out to a room)

| Event | Payload | Notes |
|---|---|---|
| `room:state` | `RoomSnapshot` (personalized per socket) | Sent after every accepted mutation (join/leave/role/start/action) and on reconnect. Clients are **stateless renderers** of the latest snapshot — there is no client-side prediction or optimistic mutation of puzzle state, by design (see section D). |
| `room:error` | `string` | Out-of-band errors not tied to a specific ack (e.g. malformed socket-level payloads). |

### C.3 Why "request → validate → broadcast", never "broadcast the request"

Every single stateful event is emitted by the *client* as a **request**, matched to an **ack**
containing accept/reject, and the *only* way state actually changes for anyone (including the actor) is
the subsequent `room:state` broadcast computed by the server. The client never locally mutates game
state optimistically. This is deliberate: it is the enforcement mechanism for "the server is
authoritative" — there is no code path where a client can render a state that the server didn't
compute and stamp with its own validation logic.

---

## D. Asymmetric Role & Permission Logic

### D.1 Where permission checks happen

Permission checks are **not** a generic middleware layer sitting in front of the scenario — they are
**enforced inside each scenario's `applyAction` reducer**, because "does this role have permission to
do X" is inseparable from "what does X mean," which is scenario-specific. E.g. in Adventure mode,
`unlock_door` is callable by *any* role (it's the team's shared final action), but `search` is
Explorer-only. Centralizing a generic RBAC layer would either be too coarse (can't express "any role,
but only after the Archer has acted") or would duplicate scenario knowledge into the framework layer,
which defeats the modularity goal.

What **is** centralized in `roomManager.ts` (and therefore uniform across every scenario) is:

1. **Identity binding** — a socket cannot claim to be a different `playerId` than the one it joined
   with (`socket.data.playerId` is set server-side on `room:join` and used for every subsequent event;
   the client never gets to assert its own identity per-action).
2. **Room/status gating** — `applyAction` is refused outright if the room isn't `active`, before the
   scenario module ever sees the request.
3. **Role exclusivity** — `role:select` prevents two *connected* players from holding the same role
   simultaneously, which is what makes the asymmetry meaningful (you can't have two Hackers trivializing
   the Hacker-only puzzle).

Inside the reducer, the pattern is always:

```ts
case "patch_service": {
  if (player.role !== "itsecadmin") return { ok: false, reason: "Only the IT Sec Admin can patch services." };
  // ...compare submitted answer to secrets, never trust the client's claim about correctness...
}
```

Because `player.role` is looked up server-side from the authoritative `RoomRuntime.players` map (sourced
from Postgres), a malicious client cannot spoof `role: "itsecadmin"` in the payload — the payload's role
claims are never trusted; only the room-manager's own record of who selected what role is.

### D.2 Preventing cheating specifically in the CTF mode

- Vulnerable ports / decode answers / malicious IPs / the final flag string all live in
  `InternalData.secrets`, which is structurally incapable of being serialized into a `room:state` event
  (the sanitizer only ever reads `pub`/`roleOnly`). Opening devtools' network/WS frames shows *only*
  what the player is meant to see.
- Every action attempt (including wrong guesses) is persisted to `action_logs`, so brute-forcing the
  flag is both slow (network round-trip + ack per guess) and fully auditable after the fact; a
  production hardening pass would add per-socket rate limiting and an escalating lockout, which
  `attemptsLeft` in each scenario already partially models at the gameplay layer.
- Role-restricted **UI** (buttons disabled unless `myRole === requiredRole`) is a UX nicety, not the
  security boundary — the boundary is the server-side check above, so even a modified client that
  re-enables the button will be rejected with `{ accepted: false, reason: "Only the ... can ..." }`.

### D.3 Extending permissions further (future work)

For modes needing finer-grained permissions than "one role = one set of actions" (e.g. a
"Team Lead" role that inherits another role's abilities, or time-boxed abilities), the plan is to
promote `abilities` on `RoleDefinition` from documentation strings to actual permission tokens
(`"adventure.search"`, `"cyber.patch"`, …) and have scenario reducers check
`hasPermission(player, "cyber.patch")` against a role→permission map, still resolved and enforced
entirely server-side. The data model already has the placeholder (`RoleDefinition.abilities`) to grow
into this without a breaking change.

---

## E. Execution Plan & Next Steps

### E.1 Recommended monorepo layout (post-MVP)

The current repo intentionally keeps everything in one Next.js app to move fast. Once a second client
(e.g. a React Native app, or a standalone realtime worker service) is needed, split into a monorepo
(pnpm/Turborepo workspaces) along these lines — note the `engine` and `scenarios` packages are *already*
factored out as standalone modules with no Next.js-specific imports, so this extraction is mechanical:

```
apps/
  web/                  Next.js app (UI + REST) — imports @nexus/engine, @nexus/scenarios, @nexus/types
  realtime/             Standalone Node service running Socket.IO + the same engine, for independent scaling
packages/
  types/                @nexus/types      — GameState, Room, Player, Socket.IO event dictionary
  engine/               @nexus/engine     — roomManager, pubsub, permission plumbing (transport-agnostic)
  scenarios/            @nexus/scenarios  — adventure.ts, cybersecurity.ts, biology.ts, math.ts, ...
  db/                   @nexus/db         — Drizzle schema + migrations
  ui/                   @nexus/ui         — shared design system components (RoleBadge, FeedPanel, ...)
infra/
  docker-compose.yml    Postgres + Redis for local dev
  k8s/ or terraform/    Deployment manifests, HPA rules for the `realtime` service
```

### E.2 MVP build order (what to validate first, in priority order)

This is the order I'd actually build in from zero, and roughly the order this repo was built in:

1. **Room lifecycle + identity** (create room, join, reconnect with persisted `playerId`) — before any
   game logic exists, prove that Postgres-backed rooms + Socket.IO + reconnect-safe identity works.
2. **One scenario, fully vertical** (Adventure) — validates the `ScenarioModule` contract end-to-end:
   role selection, authoritative validation, secret-hiding sanitizer, win/lose, activity feed.
3. **A second, structurally different scenario** (Cybersecurity) built *without touching the engine* —
   this is the real test of the "modular scenario design" requirement. If adding mode #2 requires engine
   changes, the abstraction in step 2 was wrong. (It wasn't — `roomManager.ts` didn't change.)
4. **A third scenario** (Biology) to confirm the pattern generalizes a third time, and to pressure-test
   the role-permission convention across a totally different genre of puzzle (ordering/matching vs.
   terminal/cipher vs. physical search).
5. **Redis-backed cross-instance sync** — implemented behind a feature flag (`REDIS_URL`) so local/dev/
   this sandbox run single-instance with zero external dependencies, while staging/prod can flip it on.
6. **Next (not yet built, prioritized for the following milestones):**
   - Progression/persistence across sessions (accounts, XP, unlocked levels) — needs an `users` table and
     auth (NextAuth or a lightweight JWT session), and a `completions` table keyed by `(user, scenario,
     level)`.
   - Official `@socket.io/redis-adapter` wired alongside the custom pub/sub channel for true
     cross-instance room fan-out at scale (today's custom channel already achieves correctness for
     state sync; the official adapter mainly helps `io.to(room).emit` reach sockets on other processes
     efficiently once the realtime tier is actually running >1 instance).
   - Split the realtime engine into its own service (`apps/realtime`) once WebSocket concurrency
     justifies scaling it independently from the Next.js render tier.
   - Per-socket rate limiting + structured abuse detection on `game:action`, especially for CTF mode.
   - Spectator/observer mode (read-only `room:state` subscription without a `playerId`), useful for
     classroom settings where an instructor watches multiple teams.
   - Timed levels / scoring formulas that reward speed and penalize wrong attempts, feeding into a
     leaderboard table.

### E.3 How to try it right now

1. Visit `/` — pick a scenario, enter a name, **Create Room**.
2. Share the generated room code; other players visit `/`, use **Join an existing room** with that code
   (or go straight to `/room/<CODE>`), and enter their own name.
3. In the lobby, each player picks a distinct role; the host starts the scenario once everyone is ready.
4. Work together: each role has puzzle actions only they can perform, plus a shared final action
   (unlock the door / submit the flag / synthesize the cure) that needs every role's fragment.
