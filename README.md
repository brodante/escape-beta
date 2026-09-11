# Nexus Protocol — Asymmetric Multi-Mode Escape Room

A real-time, multiplayer escape-room engine. One player hosts a room, friends join
with a short room code, everyone picks a **different asymmetric role**, and the team
must combine their unique abilities to beat the scenario — all validated by an
authoritative server so nobody can cheat by poking at the client.

Built with **Next.js + Socket.IO + Postgres (Drizzle ORM)**, with an embedded-database
fallback so you can play locally with zero setup.

---

## 🎮 How a game session works

1. **Host:** open the homepage, pick a scenario, enter your name, hit **Create Room**.
2. **Share the room code** (e.g. `YS7KZ`) with your friends.
3. **Friends:** open the homepage, enter the code under **Join an existing room**
   (or go straight to `/room/<CODE>`) and enter their name.
4. **Lobby:** each player picks a distinct role — roles are exclusive, so a team
   can't stack two Hackers to trivialize a puzzle.
5. **Host presses Start.** The scenario goes live.
6. **Cooperate:** each role has puzzle actions only they can perform. Progress is
   shared through the live activity feed, and the team wins by combining every
   role's fragment into the final action (unlock the vault / submit the flag /
   synthesize the cure).

> Single-player testing works too: open the room in several browser tabs/windows
> with different names to simulate a full team.

---

## 🗺️ Scenarios

| Mode | Fantasy | Roles | Levels |
|------|---------|-------|--------|
| **Adventure** 🧭 | Classic escape room: keys, ciphers, locked doors | Explorer (search spots) · Hacker (decode ciphers) · Healer (diagnose charts) · Archer (stand guard before the vault opens) | 1. The Sealed Study · 2. The Collapsing Archive |
| **Cybersecurity** 🛡️ | CTF-style incident response: scan, patch, decrypt, capture the flag | Pentester (recon scans) · IT Sec Admin (patch services) · Cryptographer (break ciphertext) · Forensics (hunt attacker IPs in logs) | 1. Compromised Web Server · 2. Ransomware on the Domain Controller |
| **Biology / Medical** 🧬 | Outbreak response: sequence, stabilize, synthesize a cure | Virologist · Surgeon · Pharmacologist · Field Medic | 1. Outbreak: Ward 3 · 2. Outbreak: Level-4 Containment |

Every scenario has its own briefing, role-specific secret data (never sent to the
wrong player's browser), and server-side win/lose conditions.

---

## 🚀 Quickstart (local play, zero setup)

Requirements: **Node.js 18+** and npm.

```bash
npm install
npm run dev
```

Then open **http://localhost:3000** and create a room. That's it — no database or
Redis to install:

- **No `DATABASE_URL`?** The app uses **PGlite**, a real Postgres engine running
  embedded in the Node process, persisted to `./.pglite/` with tables
  auto-created on boot (see `src/db/index.ts`).
- **No `REDIS_URL`?** Realtime fan-out uses an in-process event bus, which is
  exactly correct for a single server (see `src/server/engine/pubsub.ts`).

Verify the server is healthy at `GET /api/health` → `{"ok":true}`.

### Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the dev server (Turbopack) on port 3000 |
| `npm run build` / `npm start` | Production build / serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

---

## ⚙️ Configuration

Copy the template and adjust as needed:

```bash
cp .env.example .env.local
```

| Variable | Required? | What it does |
|----------|-----------|--------------|
| `DATABASE_URL` | Production only | Postgres connection string. When set, the app uses this real database (run `npx drizzle-kit push` once to create tables). When unset, the embedded PGlite database is used. |
| `REDIS_URL` | Only for multi-server deploys | Enables cross-instance Socket.IO fan-out. Unset = single-server in-memory bus. |
| `PGLITE_DIR` | No | Where the embedded database files live (default `./.pglite/app_db`). |

---

## 🏗️ Project structure

```
src/
  app/
    page.tsx                  homepage: pick scenario, create/join room
    room/[code]/              room + lobby + live game UI
    api/rooms/                REST: create room, fetch room snapshot
    api/scenarios/            REST: scenario catalog (roles, levels)
    api/health/               health check (also verifies DB connectivity)
  components/
    RoomLobby.tsx  PlayerRoster.tsx  FeedPanel.tsx   shared game shell
    scenarios/                mode-specific UI (Adventure/Cyber/Biology views)
  hooks/useSocket.ts          Socket.IO client hook (bootstraps /api/socket, then connects)
  pages/api/socket.ts         embeds the Socket.IO server in Next.js (needs raw
                              http.Server access, so it lives in Pages Router)
  server/
    scenarios/                pluggable game modules: adventure, cybersecurity,
                              biology (+ registry in index.ts, contract in types.ts)
    engine/
      roomManager.ts          authoritative engine: validation, state, persistence
      socketServer.ts         Socket.IO events <-> engine wiring
      pubsub.ts               Redis (or in-memory) cross-instance fan-out
  db/
    schema.ts                 rooms, players, action_logs tables (Drizzle)
    index.ts                  connection: real Postgres or embedded PGlite fallback
  lib/
    types.ts                  shared wire types + Socket.IO event dictionary
    scenarioMeta.ts           client helper to fetch scenario metadata
docs/TECHNICAL_DESIGN.md      full architecture deep-dive (scaling, data model,
                              anti-cheat, execution plan)
```

### How the pieces fit together

- **Authoritative server:** the client only sends *intent* (`game:action`); the
  scenario reducer on the server validates role permissions, checks answers against
  secrets the client never sees, and computes the new state.
- **Secrets stay secret:** each player's `room:state` payload contains public data
  plus only *their role's* slice. Opening devtools reveals nothing extra.
- **Durable rooms:** every mutation is persisted to Postgres, so rooms survive
  restarts and reconnects (your `playerId` is kept in the browser).
- **Audit trail:** every action — accepted or rejected — is appended to
  `action_logs`, which matters especially for the CTF mode.
- **Adding a scenario** = one new file satisfying the `ScenarioModule` contract
  plus one line in the registry. No engine or networking changes needed.

### Realtime events (see `src/lib/types.ts`)

Client → server: `room:join` · `role:select` · `game:start` · `game:action`
(with acknowledgement callbacks).
Server → client: `room:state` (personalized snapshot) · `room:error` ·
`action:result`.

---

## 🌐 Deploying (and custom subdomains)

> **Important: this game cannot be hosted on GitHub Pages.** GitHub Pages only
> serves static files — it can't run the Node.js server, the Socket.IO realtime
> engine, or Postgres that this game requires. Deploying here would give you a
> homepage where room creation silently fails.

Instead, deploy to a host that runs **Node.js + WebSockets**, then point your
subdomain at it with a DNS record:

**Recommended hosts (all support this stack):**

| Host | Database | Notes |
|------|----------|-------|
| [Render](https://render.com) | Managed Postgres add-on | Easy `render.yaml` blueprint; free tier available |
| [Railway](https://railway.app) | Managed Postgres + Redis plug-ins | Great DX; per-minute pricing |
| [Fly.io](https://fly.io) | Managed Postgres | Runs your Dockerfile globally, close to players |
| [Vercel](https://vercel.com) + [Neon](https://neon.tech)/[Supabase](https://supabase.com) | External serverless Postgres | ⚠️ Vercel is serverless-first, so the embedded Socket.IO server needs care — prefer Render/Railway/Fly for the realtime tier |

**Typical production setup:**

1. Provision the app + a managed Postgres (and Redis if you scale past 1 instance).
2. Set `DATABASE_URL` (and `REDIS_URL`) in the host's environment settings.
3. Run `npx drizzle-kit push` once against that database to create the tables.
4. Deploy. Check `/api/health` on the live URL.

**Pointing your subdomain at it** (e.g. `play.yourdomain.com`):

1. In your host's dashboard, add `play.yourdomain.com` as a custom domain — it
   will show you the required DNS target (a `CNAME` hostname or `A` records).
2. At your DNS provider (Cloudflare, Route 53, Namecheap, …) create the record,
   e.g. `CNAME  play  →  your-app.onrender.com`.
3. The host auto-provisions HTTPS for the subdomain. Done — share
   `https://play.yourdomain.com` with your players.

---

## 🧪 Tech stack

Next.js 16 (App Router) · React 19 · Socket.IO 4 · Drizzle ORM · Postgres
(node-postgres in production, PGlite embedded fallback locally) · Redis (ioredis,
optional) · Tailwind CSS 4 · TypeScript · Zod · nanoid

---

## 📖 Further reading

- `docs/TECHNICAL_DESIGN.md` — the full technical design document: production
  topology, horizontal scaling, data model, anti-cheat, and roadmap.
