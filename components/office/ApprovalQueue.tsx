"use client";
import { useState } from "react";
import type { AgencyState } from "@/lib/client/state";
import { timeStr } from "./ui";

export default function ApprovalQueue({ state }: { state: AgencyState | null }) {
  const [busy, setBusy] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const items = state?.outreach ?? [];

  async function act(id: number, action: string) {
    setBusy(id);
    setNote(null);
    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await res.json();
      if (data.queued) setNote(`⚠ ${data.error ?? "queued"} — SMTP missing, approval kept`);
      else if (!data.ok && data.error) setNote(`❌ ${data.error}`);
      else if (action === "send") setNote("✅ Email sent!");
      else setNote("✅ Updated");
    } catch {
      setNote("❌ Request failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-edge bg-panel">
      <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
        <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-slate-500">Approval queue</h3>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">
          {items.filter((i: any) => i.status === "pending_approval").length} awaiting
        </span>
      </div>
      <div className="max-h-[520px] overflow-y-auto p-2">
        {note && <p className="mb-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-[11px] font-mono text-emerald-300">{note}</p>}
        {items.length === 0 && <p className="p-4 text-center text-xs text-slate-500">No drafted messages yet.</p>}
        {items.map((o: any) => (
          <div key={o.id} className="mb-2 rounded-lg border border-edge/70 bg-slate-900/50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase text-amber-400">{o.status}</span>
                  <span className="font-mono text-[10px] text-slate-500">#{o.id}</span>
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-100">{o.institution_name || `School #${o.institution_id}`}</div>
                {o.subject && <div className="truncate text-[11px] text-slate-400"><span className="font-semibold">Subject:</span> {o.subject}</div>}
              </div>
              <span className="shrink-0 font-mono text-[10px] text-slate-500">{timeStr(o.created_at)}</span>
            </div>
            <p className="mt-2 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg bg-black/30 p-2 text-[11px] leading-relaxed text-slate-300">
              {o.body}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                onClick={() => act(o.id, "send")}
                disabled={busy === o.id}
                className="cursor-pointer rounded-md bg-emerald-500 px-2.5 py-1 font-mono text-[11px] font-bold text-black transition-colors hover:bg-emerald-400 disabled:opacity-50"
              >
                {busy === o.id ? "…" : "✓ APPROVE + SEND"}
              </button>
              <button
                onClick={() => act(o.id, "reject")}
                disabled={busy === o.id}
                className="cursor-pointer rounded-md border border-rose-500/40 px-2.5 py-1 font-mono text-[11px] text-rose-300 transition-colors hover:bg-rose-500/10 disabled:opacity-50"
              >
                REJECT
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}