"use client";
import { useState } from "react";
import { CATEGORY_CONFIG } from "@/agents/types";

const STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat",
  "Haryana", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Odisha",
  "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "Uttarakhand",
  "West Bengal", "Jharkhand", "Himachal Pradesh",
];

export default function MissionLauncher() {
  const [state, setState] = useState("auto");
  const [category, setCategory] = useState("School");
  const [limit, setLimit] = useState(40);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function launch() {
    setBusy(true);
    setMsg("Mission queued — lead machine is sweeping all India…");
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: state === "auto" ? "" : state, category, limit }),
      });
      const data = await res.json();
      setMsg(data.error ? `❌ ${data.error}` : `🚀 Mission running${state === "auto" ? " (all India)" : ""} — ${category}s`);
    } catch {
      setMsg("❌ Failed to launch mission");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-edge bg-panel p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-slate-500">Lead machine</h3>
        <span className="font-mono text-[10px] text-emerald-400">ALL INDIA</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <label className="flex flex-col gap-1 text-[10px] text-slate-500">
          Region
          <select
            className="cursor-pointer rounded-lg border border-edge bg-slate-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-400"
            value={state}
            onChange={(e) => setState(e.target.value)}
          >
            <option value="auto">All India (auto)</option>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-slate-500">
          Category
          <select
            className="cursor-pointer rounded-lg border border-edge bg-slate-900 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-400"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORY_CONFIG.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-slate-500">
          Lead cap
          <input
            type="number"
            min={1}
            max={120}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(120, Number(e.target.value) || 1)))}
            className="cursor-pointer rounded-lg border border-edge bg-slate-900 px-2 py-1.5 font-mono text-xs text-slate-200 outline-none focus:border-emerald-400"
          />
        </label>
        <div className="flex flex-col justify-end">
          <button
            onClick={launch}
            disabled={busy}
            className="cursor-pointer rounded-lg bg-emerald-500 px-3 py-2 font-mono text-xs font-bold text-black transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "LAUNCHING…" : "🚀 LAUNCH MISSION"}
          </button>
        </div>
      </div>
      {msg && <p className="mt-2 text-[11px] font-mono text-slate-400">{msg}</p>}
    </div>
  );
}