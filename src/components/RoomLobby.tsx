"use client";

import type { PlayerPublic, RoleDefinition } from "@/lib/types";

export function RoomLobby({
  code,
  roles,
  players,
  myPlayerId,
  myRole,
  isHost,
  onSelectRole,
  onStart,
  error,
}: {
  code: string;
  roles: RoleDefinition[];
  players: PlayerPublic[];
  myPlayerId: string;
  myRole: string | null;
  isHost: boolean;
  onSelectRole: (role: string) => void;
  onStart: () => void;
  error?: string | null;
}) {
  const takenRoles = new Set(players.filter((p) => p.connected && p.id !== myPlayerId).map((p) => p.role));
  const everyoneReady = players.filter((p) => p.connected).every((p) => p.role);

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p className="text-xs uppercase tracking-wider text-slate-400">Room Code</p>
        <p className="mb-6 font-mono text-3xl font-bold text-white">{code}</p>
        <h2 className="mb-4 text-lg font-semibold text-white">Choose your role</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {roles.map((role) => {
            const taken = takenRoles.has(role.id);
            const selected = myRole === role.id;
            return (
              <button
                key={role.id}
                disabled={taken}
                onClick={() => onSelectRole(role.id)}
                className={`flex flex-col gap-1 rounded-xl border p-4 text-left transition ${
                  selected
                    ? "border-indigo-400 bg-indigo-950/50 ring-1 ring-indigo-400"
                    : taken
                      ? "cursor-not-allowed border-slate-800 bg-slate-900/40 opacity-40"
                      : "border-slate-700 bg-slate-800/50 hover:border-indigo-500 hover:bg-slate-800"
                }`}
              >
                <span className="flex items-center gap-2 text-base font-semibold text-white">
                  <span>{role.icon}</span>
                  {role.name}
                </span>
                <span className="text-sm text-slate-400">{role.tagline}</span>
                <ul className="mt-1 list-inside list-disc text-xs text-slate-500">
                  {role.abilities.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
                {taken && <span className="text-xs font-semibold text-rose-400">Taken</span>}
              </button>
            );
          })}
        </div>

        {error && <p className="mt-4 text-sm font-medium text-rose-400">{error}</p>}

        {isHost ? (
          <button
            onClick={onStart}
            disabled={!everyoneReady}
            className="mt-6 w-full rounded-xl bg-indigo-500 py-3 font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {everyoneReady ? "Start Scenario" : "Waiting for everyone to pick a role…"}
          </button>
        ) : (
          <p className="mt-6 text-center text-sm text-slate-400">Waiting for the host to start the scenario…</p>
        )}
      </div>
    </div>
  );
}
