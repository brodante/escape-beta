"use client";

import type { FeedEntry } from "@/lib/types";

const toneStyles: Record<FeedEntry["tone"], string> = {
  info: "border-slate-600 bg-slate-800/60 text-slate-200",
  success: "border-emerald-600 bg-emerald-950/60 text-emerald-200",
  warning: "border-amber-600 bg-amber-950/60 text-amber-200",
  danger: "border-rose-600 bg-rose-950/60 text-rose-200",
};

export function FeedPanel({ feed }: { feed: FeedEntry[] }) {
  const items = [...feed].reverse();
  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">Activity Feed</h3>
      {items.length === 0 && <p className="text-sm text-slate-500">Nothing has happened yet.</p>}
      {items.map((entry) => (
        <div key={entry.id} className={`rounded-lg border px-3 py-2 text-sm ${toneStyles[entry.tone]}`}>
          {entry.message}
        </div>
      ))}
    </div>
  );
}
