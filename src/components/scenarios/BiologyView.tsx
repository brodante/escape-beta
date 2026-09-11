"use client";

import { useState } from "react";
import type { ActionRequest, ActionResult, GameState } from "@/lib/types";

interface BiologyData {
  title: string;
  strainDone: boolean;
  vitalsDone: boolean;
  ratioDone: boolean;
  triageDone: boolean;
  strains: string[];
  interventions: string[];
  patients: string[];
  fragments: Record<string, string | null>;
  attemptsLeft: number;
}

export function BiologyView({
  state,
  myRole,
  sendAction,
}: {
  state: GameState;
  myRole: string | null;
  sendAction: (action: ActionRequest) => Promise<ActionResult>;
}) {
  const data = state.data as unknown as BiologyData;
  const [ratio, setRatio] = useState("");
  const [order, setOrder] = useState<string[]>(data.patients);
  const [cureCode, setCureCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function act(action: ActionRequest) {
    const res = await sendAction(action);
    setMsg(res.accepted ? null : res.reason ?? "Action rejected.");
  }

  function moveUp(i: number) {
    if (i === 0) return;
    const next = [...order];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setOrder(next);
  }
  function moveDown(i: number) {
    if (i === order.length - 1) return;
    const next = [...order];
    [next[i + 1], next[i]] = [next[i], next[i + 1]];
    setOrder(next);
  }

  return (
    <div className="grid gap-4">
      <h2 className="text-xl font-bold text-white">{data.title}</h2>
      {msg && <p className="rounded-lg border border-rose-700 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">{msg}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="mb-2 font-semibold text-pink-300">🧬 Virologist — Sequence pathogen</h3>
          <div className="flex flex-wrap gap-2">
            {data.strains.map((strain) => (
              <button
                key={strain}
                disabled={myRole !== "virologist" || data.strainDone}
                onClick={() => act({ type: "sequence_pathogen", payload: { strain } })}
                className="rounded-lg border border-pink-700 bg-pink-950/40 px-3 py-1.5 text-sm text-pink-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {strain}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="mb-2 font-semibold text-rose-300">🩺 Surgeon — Stabilize patient</h3>
          <div className="flex flex-col gap-2">
            {data.interventions.map((intervention) => (
              <button
                key={intervention}
                disabled={myRole !== "surgeon" || data.vitalsDone}
                onClick={() => act({ type: "stabilize_patient", payload: { action: intervention } })}
                className="rounded-lg border border-rose-700 bg-rose-950/30 px-3 py-1.5 text-left text-sm text-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {intervention}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="mb-2 font-semibold text-fuchsia-300">🧪 Pharmacologist — Mix compound</h3>
          <p className="mb-2 text-xs text-slate-500">Enter the ratio as X:Y</p>
          <div className="flex gap-2">
            <input
              value={ratio}
              onChange={(e) => setRatio(e.target.value)}
              disabled={myRole !== "pharmacologist" || data.ratioDone}
              placeholder="e.g. 3:1"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-40"
            />
            <button
              disabled={myRole !== "pharmacologist" || data.ratioDone}
              onClick={() => act({ type: "mix_compound", payload: { ratio } })}
              className="rounded-lg bg-fuchsia-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Mix
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="mb-2 font-semibold text-orange-300">⛑️ Field Medic — Triage order (most severe first)</h3>
          <ul className="flex flex-col gap-1">
            {order.map((patient, i) => (
              <li key={patient} className="flex items-center justify-between rounded-lg border border-orange-800 bg-orange-950/30 px-3 py-1.5 text-sm text-orange-200">
                <span>{patient}</span>
                <span className="flex gap-1">
                  <button disabled={myRole !== "fieldmedic" || data.triageDone} onClick={() => moveUp(i)} className="disabled:opacity-30">
                    ▲
                  </button>
                  <button disabled={myRole !== "fieldmedic" || data.triageDone} onClick={() => moveDown(i)} className="disabled:opacity-30">
                    ▼
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <button
            disabled={myRole !== "fieldmedic" || data.triageDone}
            onClick={() => act({ type: "triage_order", payload: { order } })}
            className="mt-2 rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Confirm Order
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <h3 className="mb-2 font-semibold text-white">🧫 Synthesize Cure</h3>
        <p className="mb-2 text-sm text-slate-400">
          Fragments: strain={data.fragments.virologist ?? "?"} · vitals={data.fragments.surgeon ?? "?"} · ratio=
          {data.fragments.pharmacologist ?? "?"}. Attempts left: {data.attemptsLeft}
        </p>
        <div className="flex gap-2">
          <input
            value={cureCode}
            onChange={(e) => setCureCode(e.target.value)}
            placeholder="e.g. VCOV9-IV-OK-R31"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-mono text-sm text-white"
          />
          <button onClick={() => act({ type: "synthesize_cure", payload: { code: cureCode } })} className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-slate-900">
            Synthesize
          </button>
        </div>
      </div>
    </div>
  );
}
