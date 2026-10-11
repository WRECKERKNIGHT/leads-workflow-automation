"use client";
import { useState } from "react";
import type { AgencyState } from "@/lib/client/state";
import { STAGE_META, yesNo, host } from "./ui";

const CATS = ["", "School", "College", "University", "Coaching Institute", "Computer / IT Training"];

export default function LeadsDirectory({ state }: { state: AgencyState | null }) {
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const institutions = state?.institutions ?? [];

  const filtered = institutions.filter((i: any) => {
    if (cat && i.category !== cat) return false;
    if (stage && i.stage !== stage) return false;
    if (q) {
      const n = `${i.name ?? ""} ${i.state ?? ""} ${i.city ?? ""}`.toLowerCase();
      if (!n.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search school, city, state…"
          className="rounded-lg border border-edge bg-panel px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-emerald-400"
        />
        <select value={cat} onChange={(e) => setCat(e.target.value)}
          className="cursor-pointer rounded-lg border border-edge bg-panel px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-400">
          <option value="">All categories</option>
          {CATS.filter(Boolean).map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)}
          className="cursor-pointer rounded-lg border border-edge bg-panel px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-400">
          <option value="">All stages</option>
          {Object.entries(STAGE_META).map(([k, m]) => <option key={k} value={k}>{m.name}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-edge bg-panel">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead>
            <tr className="border-b border-edge font-mono text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2">School</th>
              <th className="px-3 py-2">Location</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Website</th>
              <th className="px-3 py-2">App</th>
              <th className="px-3 py-2">Mobile</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Demo</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">No matches yet — launch the lead machine.</td></tr>
            )}
            {filtered.map((i: any) => {
              const meta = (STAGE_META as Record<string, (typeof STAGE_META)["discovery"]>)[i.stage] ?? STAGE_META.discovery;
              return (
                <tr key={i.id} className="border-b border-edge/50 hover:bg-slate-900/50">
                  <td className="max-w-[220px] truncate px-3 py-2 font-semibold text-slate-100">{i.name || `School #${i.id}`}</td>
                  <td className="px-3 py-2 text-slate-400">{i.city || "—"}{i.city && i.state ? ", " : ""}{i.state || ""}</td>
                  <td className="px-3 py-2 text-slate-400">{i.category || "—"}</td>
                  <td className="px-3 py-2"><span className={`font-mono text-[10px] ${meta.text}`}>{meta.short}</span></td>
                  <td className="px-3 py-2 font-mono text-[11px] text-sky-300">{host(i.website) || "—"}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">{i.app && i.app.status ? (i.app.status === "not_found" ? "✗" : "✓") : "—"}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{yesNo(i.mobile_optimized)}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-slate-400">{i.email ? "✉︎" : ""}{i.phone ? " ☎" : ""}{!i.email && !i.phone ? "—" : ""}</td>
                  <td className="px-3 py-2 font-mono text-[11px]">{i.latest_demo_at ? <span className="text-emerald-400">✓</span> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 font-mono text-[10px] text-slate-500">{filtered.length} of {institutions.length} leads</p>
    </div>
  );
}