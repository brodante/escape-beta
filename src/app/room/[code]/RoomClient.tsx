"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSocket } from "@/hooks/useSocket";
import { fetchScenarios, type ScenarioMeta } from "@/lib/scenarioMeta";
import type { ActionRequest, ActionResult, RoomSnapshot } from "@/lib/types";
import { RoomLobby } from "@/components/RoomLobby";
import { PlayerRoster } from "@/components/PlayerRoster";
import { FeedPanel } from "@/components/FeedPanel";
import { AdventureView } from "@/components/scenarios/AdventureView";
import { CyberView } from "@/components/scenarios/CyberView";
import { BiologyView } from "@/components/scenarios/BiologyView";

function storageKey(code: string) {
  return `escape-room:player:${code}`;
}

export function RoomClient({ code }: { code: string }) {
  const { socketRef, connected } = useSocket();
  const [name, setName] = useState("");
  const [joined, setJoined] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);

  useEffect(() => {
    fetchScenarios().then(setScenarios).catch(() => setScenarios([]));
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(storageKey(code));
    if (raw) {
      try {
        const stored = JSON.parse(raw) as { name: string; playerId: string };
        setName(stored.name);
      } catch {
        // ignore
      }
    }
  }, [code]);

  const doJoin = useCallback(
    (joinName: string) => {
      const socket = socketRef.current;
      if (!socket) return;
      const raw = localStorage.getItem(storageKey(code));
      let storedPlayerId: string | undefined;
      if (raw) {
        try {
          storedPlayerId = (JSON.parse(raw) as { playerId?: string }).playerId;
        } catch {
          storedPlayerId = undefined;
        }
      }
      socket.emit("room:join", { code, name: joinName, playerId: storedPlayerId }, (res) => {
        if (!res.ok) {
          setJoinError(res.error);
          return;
        }
        setJoined(true);
        setJoinError(null);
        setPlayerId(res.playerId);
        setSnapshot(res.snapshot);
        localStorage.setItem(storageKey(code), JSON.stringify({ name: joinName, playerId: res.playerId }));
      });
    },
    [code, socketRef],
  );

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.on("room:state", (snap) => setSnapshot(snap));
    return () => {
      socket.off("room:state");
    };
  }, [socketRef, connected]);

  // Auto-rejoin on reconnect if we already have a stored identity.
  useEffect(() => {
    if (!connected) return;
    const raw = localStorage.getItem(storageKey(code));
    if (raw && !joined) {
      try {
        const stored = JSON.parse(raw) as { name: string };
        doJoin(stored.name);
      } catch {
        // ignore
      }
    }
  }, [connected, code, joined, doJoin]);

  const sendAction = useCallback(
    (action: ActionRequest): Promise<ActionResult> =>
      new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket) return resolve({ accepted: false, reason: "Not connected." });
        socket.emit("game:action", action, resolve);
      }),
    [socketRef],
  );

  if (!connected) {
    return <CenteredMessage>Connecting to server…</CenteredMessage>;
  }

  if (!joined || !snapshot) {
    return (
      <CenteredMessage>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) doJoin(name.trim());
          }}
          className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-6"
        >
          <p className="text-xs uppercase tracking-wider text-slate-400">Room</p>
          <p className="font-mono text-2xl font-bold text-white">{code}</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"
            maxLength={24}
          />
          <button type="submit" className="rounded-lg bg-indigo-500 py-2 font-semibold text-white hover:bg-indigo-400">
            Join Room
          </button>
          {joinError && <p className="text-sm text-rose-400">{joinError}</p>}
        </form>
      </CenteredMessage>
    );
  }

  const scenarioMeta = scenarios.find((s) => s.id === snapshot.scenarioId);
  const me = snapshot.players.find((p) => p.id === playerId);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-300">
            ← Leave
          </Link>
          <h1 className="text-2xl font-bold text-white">{scenarioMeta?.name ?? snapshot.scenarioId}</h1>
        </div>
        <StatusPill status={snapshot.status} />
      </header>

      {snapshot.status === "lobby" && scenarioMeta && me && (
        <RoomLobby
          code={snapshot.code}
          roles={scenarioMeta.roles}
          players={snapshot.players}
          myPlayerId={me.id}
          myRole={me.role}
          isHost={me.isHost}
          error={lobbyError}
          onSelectRole={(role) => {
            socketRef.current?.emit("role:select", { role }, (res) => setLobbyError(res.accepted ? null : res.reason ?? "Rejected"));
          }}
          onStart={() => {
            socketRef.current?.emit("game:start", (res) => setLobbyError(res.accepted ? null : res.reason ?? "Rejected"));
          }}
        />
      )}

      {(snapshot.status === "active" || snapshot.status === "won" || snapshot.status === "lost") && (
        <div className="grid gap-6 lg:grid-cols-[3fr_1fr]">
          <div>
            {snapshot.status !== "active" && (
              <div
                className={`mb-4 rounded-xl border p-4 text-center text-lg font-bold ${
                  snapshot.status === "won" ? "border-emerald-600 bg-emerald-950/50 text-emerald-200" : "border-rose-600 bg-rose-950/50 text-rose-200"
                }`}
              >
                {snapshot.status === "won" ? "🎉 Scenario complete — you escaped!" : "💀 Mission failed."}
              </div>
            )}
            {snapshot.scenarioId === "adventure" && <AdventureView state={snapshot.state} myRole={me?.role ?? null} sendAction={sendAction} />}
            {snapshot.scenarioId === "cybersecurity" && <CyberView state={snapshot.state} myRole={me?.role ?? null} sendAction={sendAction} />}
            {snapshot.scenarioId === "biology" && <BiologyView state={snapshot.state} myRole={me?.role ?? null} sendAction={sendAction} />}
          </div>
          <div className="flex flex-col gap-4">
            <PlayerRoster players={snapshot.players} roles={scenarioMeta?.roles ?? []} currentPlayerId={playerId} />
            <div className="h-80">
              <FeedPanel feed={snapshot.state.feed} />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    lobby: "bg-slate-700 text-slate-200",
    active: "bg-indigo-600 text-white",
    won: "bg-emerald-600 text-white",
    lost: "bg-rose-600 text-white",
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${styles[status] ?? styles.lobby}`}>{status}</span>;
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-screen place-items-center px-4 text-slate-200">{children}</main>;
}
