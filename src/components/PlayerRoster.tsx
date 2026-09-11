"use client";

import type { PlayerPublic, RoleDefinition } from "@/lib/types";

export function PlayerRoster({
  players,
  roles,
  currentPlayerId,
}: {
  players: PlayerPublic[];
  roles: RoleDefinition[];
  currentPlayerId: string | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Players</h3>
      <ul className="flex flex-col gap-2">
        {players.map((p) => {
          const role = roles.find((r) => r.id === p.role);
          return (
            <li
              key={p.id}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                p.id === currentPlayerId ? "border-indigo-500 bg-indigo-950/40" : "border-slate-800 bg-slate-800/40"
              }`}
            >
              <span className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${p.connected ? "bg-emerald-400" : "bg-slate-600"}`} />
                <span className="font-medium text-slate-100">{p.name}</span>
                {p.isHost && <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">HOST</span>}
              </span>
              <span className="flex items-center gap-1 text-slate-300">
                {role ? (
                  <>
                    <span>{role.icon}</span>
                    <span>{role.name}</span>
                  </>
                ) : (
                  <span className="text-slate-500">choosing…</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
