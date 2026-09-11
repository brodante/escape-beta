"use client";

import { useState } from "react";
import type { ActionRequest, ActionResult, GameState } from "@/lib/types";

interface AdventureData {
  title: string;
  guardActive: boolean;
  explorerFound: boolean;
  hackerFound: boolean;
  healerFound: boolean;
  fragments: { explorer: string | null; hacker: string | null; healer: string | null };
  spots: string[];
  cipherText: string;
  shift: number;
  diagnosisOptions: { id: string; label: string }[];
  attemptsLeft: number;
}

export function AdventureView({
  state,
  myRole,
  sendAction,
}: {
  state: GameState;
  myRole: string | null;
  sendAction: (action: ActionRequest) => Promise<ActionResult>;
}) {
  const data = state.data as unknown as AdventureData;
  const [cipherAnswer, setCipherAnswer] = useState("");
  const [doorCode, setDoorCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function act(action: ActionRequest) {
    const res = await sendAction(action);
    if (!res.accepted) setMsg(res.reason ?? "Action rejected.");
    else setMsg(null);
  }

  return (
    <div className="grid gap-4">
      <h2 className="text-xl font-bold text-white">{data.title}</h2>
      {msg && <p className="rounded-lg border border-rose-700 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">{msg}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="mb-2 font-semibold text-amber-300">🧭 Explorer — Search the room</h3>
          <p className="mb-2 text-sm text-slate-400">Fragment: {data.fragments.explorer ?? "???"}</p>
          <div className="flex flex-wrap gap-2">
            {data.spots.map((spot) => (
              <button
                key={spot}
                disabled={myRole !== "explorer" || data.explorerFound}
                onClick={() => act({ type: "search", payload: { spot } })}
                className="rounded-lg border border-amber-700 bg-amber-950/40 px-3 py-1.5 text-sm text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {spot}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="mb-2 font-semibold text-violet-300">💻 Hacker — Decode cipher</h3>
          <p className="mb-2 text-sm text-slate-400">Fragment: {data.fragments.hacker ?? "???"}</p>
          <p className="mb-2 font-mono text-lg tracking-widest text-violet-200">{data.cipherText}</p>
          <p className="mb-2 text-xs text-slate-500">Caesar shift of {data.shift} was used to encode a plain word.</p>
          <div className="flex gap-2">
            <input
              value={cipherAnswer}
              onChange={(e) => setCipherAnswer(e.target.value)}
              disabled={myRole !== "hacker" || data.hackerFound}
              placeholder="Decoded word"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-40"
            />
            <button
              disabled={myRole !== "hacker" || data.hackerFound}
              onClick={() => act({ type: "decode_cipher", payload: { answer: cipherAnswer } })}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Submit
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="mb-2 font-semibold text-emerald-300">💊 Healer — Diagnose patient</h3>
          <p className="mb-2 text-sm text-slate-400">Fragment: {data.fragments.healer ?? "???"}</p>
          <div className="flex flex-col gap-2">
            {data.diagnosisOptions.map((opt) => (
              <button
                key={opt.id}
                disabled={myRole !== "healer" || data.healerFound}
                onClick={() => act({ type: "diagnose", payload: { optionId: opt.id } })}
                className="rounded-lg border border-emerald-700 bg-emerald-950/40 px-3 py-1.5 text-left text-sm text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="mb-2 font-semibold text-sky-300">🏹 Archer — Stand guard</h3>
          <p className="mb-3 text-sm text-slate-400">
            Status: {data.guardActive ? <span className="text-emerald-400">Guarding — safe to act</span> : <span className="text-rose-400">No guard</span>}
          </p>
          <button
            disabled={myRole !== "archer" || data.guardActive}
            onClick={() => act({ type: "stand_guard" })}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Stand Guard
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <h3 className="mb-2 font-semibold text-white">🚪 Vault Door</h3>
        <p className="mb-2 text-sm text-slate-400">
          Combine fragments ({data.fragments.explorer ?? "?"} / {data.fragments.hacker ?? "?"} / {data.fragments.healer ?? "?"}) into the unlock code.
          Attempts left: {data.attemptsLeft}
        </p>
        <div className="flex gap-2">
          <input
            value={doorCode}
            onChange={(e) => setDoorCode(e.target.value)}
            placeholder="e.g. 17-KEY-R9"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white"
          />
          <button
            onClick={() => act({ type: "unlock_door", payload: { code: doorCode } })}
            className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-slate-900"
          >
            Unlock
          </button>
        </div>
      </div>
    </div>
  );
}
