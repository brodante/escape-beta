"use client";

import { useState } from "react";
import type { ActionRequest, ActionResult, GameState } from "@/lib/types";

interface Service {
  port: number;
  name: string;
  vulnerable: boolean;
}
interface LogEntry {
  ip: string;
  note: string;
}
interface CyberData {
  title: string;
  scanDone: boolean;
  patched: boolean;
  cryptoSolved: boolean;
  forensicsSolved: boolean;
  scanOutput: Service[] | null;
  cipherText: string;
  logs: LogEntry[];
  fragments: Record<string, string | null>;
  attemptsLeft: number;
}

export function CyberView({
  state,
  myRole,
  sendAction,
}: {
  state: GameState;
  myRole: string | null;
  sendAction: (action: ActionRequest) => Promise<ActionResult>;
}) {
  const data = state.data as unknown as CyberData;
  const [decoded, setDecoded] = useState("");
  const [flag, setFlag] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function act(action: ActionRequest) {
    const res = await sendAction(action);
    setMsg(res.accepted ? null : res.reason ?? "Action rejected.");
  }

  return (
    <div className="grid gap-4">
      <h2 className="text-xl font-bold text-white">{data.title}</h2>
      {msg && <p className="rounded-lg border border-rose-700 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">{msg}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 font-mono">
          <h3 className="mb-2 font-sans font-semibold text-emerald-300">🛰️ Pentester — nmap scan</h3>
          <button
            disabled={myRole !== "pentester" || data.scanDone}
            onClick={() => act({ type: "run_scan" })}
            className="mb-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-sans font-semibold text-white disabled:opacity-40"
          >
            $ run scan
          </button>
          {data.scanOutput ? (
            <pre className="whitespace-pre-wrap rounded-lg bg-black/60 p-3 text-xs text-emerald-300">
{data.scanOutput.map((s) => `PORT ${s.port}\t${s.name}${s.vulnerable ? "  [VULNERABLE]" : ""}`).join("\n")}
            </pre>
          ) : (
            <p className="text-sm text-slate-500">No scan results yet.</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="mb-2 font-semibold text-blue-300">🛡️ IT Sec Admin — Patch service</h3>
          <p className="mb-2 text-sm text-slate-400">Requires scan results first.</p>
          <div className="flex flex-wrap gap-2">
            {(data.scanOutput ?? []).map((s) => (
              <button
                key={s.port}
                disabled={myRole !== "itsecadmin" || data.patched}
                onClick={() => act({ type: "patch_service", payload: { port: s.port } })}
                className="rounded-lg border border-blue-700 bg-blue-950/40 px-3 py-1.5 text-sm text-blue-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Patch port {s.port}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="mb-2 font-semibold text-purple-300">🔐 Cryptographer — Decode message</h3>
          <p className="mb-2 font-mono text-sm tracking-wide text-purple-200">{data.cipherText}</p>
          <p className="mb-2 text-xs text-slate-500">Intercepted transmission (ROT13).</p>
          <div className="flex gap-2">
            <input
              value={decoded}
              onChange={(e) => setDecoded(e.target.value)}
              disabled={myRole !== "cryptographer" || data.cryptoSolved}
              placeholder="Decoded message"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-40"
            />
            <button
              disabled={myRole !== "cryptographer" || data.cryptoSolved}
              onClick={() => act({ type: "decode_message", payload: { answer: decoded } })}
              className="rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Submit
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <h3 className="mb-2 font-semibold text-rose-300">🔍 Forensics — Identify attacker IP</h3>
          <div className="flex flex-col gap-2">
            {data.logs.map((log) => (
              <button
                key={log.ip}
                disabled={myRole !== "forensics" || data.forensicsSolved}
                onClick={() => act({ type: "analyze_logs", payload: { ip: log.ip } })}
                className="flex justify-between rounded-lg border border-rose-700 bg-rose-950/30 px-3 py-1.5 text-left text-sm text-rose-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="font-mono">{log.ip}</span>
                <span className="text-slate-400">{log.note}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <h3 className="mb-2 font-semibold text-white">🏁 Capture the Flag</h3>
        <p className="mb-2 text-sm text-slate-400">
          Fragments: pentester={data.fragments.pentester ?? "?"} · admin={data.fragments.itsecadmin ?? "?"} · crypto=
          {data.fragments.cryptographer ?? "?"} · forensics={data.fragments.forensics ?? "?"}. Attempts left: {data.attemptsLeft}
        </p>
        <div className="flex gap-2">
          <input
            value={flag}
            onChange={(e) => setFlag(e.target.value)}
            placeholder="FLAG{...}"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 font-mono text-sm text-white"
          />
          <button onClick={() => act({ type: "submit_flag", payload: { flag } })} className="rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-slate-900">
            Submit Flag
          </button>
        </div>
      </div>
    </div>
  );
}
