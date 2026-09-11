"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchScenarios, type ScenarioMeta } from "@/lib/scenarioMeta";
import { SCENARIOS } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<ScenarioMeta[]>([]);
  const [selected, setSelected] = useState<string>("adventure");
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchScenarios().then(setScenarios).catch(() => setScenarios([]));
  }, []);

  async function createRoom() {
    setError(null);
    if (!name.trim()) return setError("Enter your name first.");
    setBusy(true);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: selected, hostName: name.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create room.");
      router.push(`/room/${json.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room.");
    } finally {
      setBusy(false);
    }
  }

  function joinRoom() {
    setError(null);
    if (!joinCode.trim()) return setError("Enter a room code.");
    router.push(`/room/${joinCode.trim().toUpperCase()}`);
  }

  const activeScenario = scenarios.find((s) => s.id === selected);

  return (
    <main className="mx-auto max-w-6xl px-4 py-12">
      <div className="mb-10 text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-indigo-400">Nexus Protocol</p>
        <h1 className="text-4xl font-extrabold text-white sm:text-5xl">Asymmetric Multi-Mode Escape Room</h1>
        <p className="mx-auto mt-3 max-w-2xl text-slate-400">
          A real-time, role-based cooperative engine. Pick a scenario, choose an asymmetric role, and work together against
          an authoritative server that validates every move.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-white">1. Choose a scenario</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s.id)}
                className={`rounded-2xl border p-5 text-left transition ${
                  selected === s.id ? "border-indigo-400 ring-1 ring-indigo-400" : "border-slate-800 hover:border-slate-600"
                } bg-gradient-to-br ${s.theme} bg-opacity-10`}
              >
                <p className="text-lg font-bold text-white">{s.name}</p>
                <p className="mt-1 text-sm text-white/80">{s.tagline}</p>
              </button>
            ))}
          </div>

          {activeScenario && (
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <h3 className="mb-2 font-semibold text-white">Roles in {activeScenario.name}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {activeScenario.roles.map((role) => (
                  <div key={role.id} className="rounded-xl border border-slate-800 bg-slate-800/40 p-3">
                    <p className="font-medium text-white">
                      {role.icon} {role.name}
                    </p>
                    <p className="text-xs text-slate-400">{role.tagline}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="mb-3 text-lg font-semibold text-white">2. Host a new room</h2>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={24}
              className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white"
            />
            <button
              onClick={createRoom}
              disabled={busy}
              className="w-full rounded-lg bg-indigo-500 py-2 font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create Room"}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="mb-3 text-lg font-semibold text-white">Join an existing room</h2>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              maxLength={8}
              className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-white"
            />
            <button onClick={joinRoom} className="w-full rounded-lg bg-slate-700 py-2 font-semibold text-white transition hover:bg-slate-600">
              Join Room
            </button>
          </div>

          {error && <p className="rounded-lg border border-rose-700 bg-rose-950/50 px-3 py-2 text-sm text-rose-300">{error}</p>}
        </div>
      </div>
    </main>
  );
}
