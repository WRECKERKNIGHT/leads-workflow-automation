"use client";

import { useMemo, useState } from "react";
import { waLink } from "@/lib/whatsapp";

interface Lead {
  id: number;
  name: string;
  category: string;
  state: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  admissions_email: string | null;
  website: string | null;
  stage: string;
  folder_status: string;
  whatsapp_available: number;
  site_verified: number;
  opportunity_priority: string | null;
}

const STAGE_LABEL: Record<string, string> = {
  discovery: "Discovered",
  organizer: "Contacts",
  research: "Research",
  opportunity: "Opportunity",
  demo: "Demo",
  message: "Message",
  sent: "Sent",
  reply: "Replied",
  done: "Done",
};

export default function LeadTable({ slug, leads, total }: { slug: string; leads: Lead[]; total: number }) {
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const filtered = useMemo(() => {
    let list = leads;
    if (stage) list = list.filter((l) => l.stage === stage);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((l) =>
        `${l.name ?? ""} ${l.city ?? ""} ${l.state ?? ""} ${l.phone ?? ""}`.toLowerCase().includes(needle)
      );
    }
    return list;
  }, [leads, q, stage]);

  async function openChat(lead: Lead) {
    setBusy(lead.id);
    try {
      const res = await fetch(`/api/leads/${lead.id}/whatsapp`, { method: "POST" });
      const out = await res.json();
      if (out.ok && out.waLink) {
        window.open(out.waLink, "_blank", "noopener");
      } else {
        alert(out.error ?? "No usable number on this lead yet.");
      }
    } catch {
      alert("WhatsApp handoff failed.");
    } finally {
      setBusy(null);
    }
  }

  async function copyMessage(lead: Lead) {
    const res = await fetch(`/api/leads/${lead.id}/whatsapp`, { method: "POST" });
    const out = await res.json();
    if (out.ok && out.message) {
      try {
        await navigator.clipboard.writeText(out.message);
        setCopied(lead.id);
        setTimeout(() => setCopied(null), 1400);
      } catch {
        alert(out.message);
      }
    }
  }

  return (
    <div className="rounded-2xl border border-edge bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge p-4">
        <div>
          <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-white">Leads · {total.toLocaleString("en-IN")}</h3>
          <p className="mt-0.5 text-[11px] text-faint">Search the floor, then export the whole set for manual approaching.</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/categories/${slug}/export?format=csv`}
            className="cursor-pointer border border-white/30 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-white hover:border-white hover:bg-white hover:text-black"
          >
            ⌄ export csv
          </a>
          <a
            href={`/api/categories/${slug}/export?format=json`}
            className="cursor-pointer border border-white/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-white/60 hover:border-white hover:text-white"
          >
            json
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-edge px-4 py-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, city, state, phone…"
          className="min-w-[220px] flex-1 rounded border border-edge bg-black px-3 py-1.5 text-xs text-white outline-none placeholder:text-faint focus:border-white/60"
        />
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="cursor-pointer rounded border border-edge bg-black px-3 py-1.5 text-xs text-white outline-none focus:border-white/60"
        >
          <option value="">All stages</option>
          {Object.entries(STAGE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-left text-xs">
          <thead>
            <tr className="border-b border-edge font-mono text-[9px] uppercase tracking-widest text-faint">
              <th className="px-4 py-2.5">Business</th>
              <th className="px-4 py-2.5">Location</th>
              <th className="px-4 py-2.5">Phone</th>
              <th className="px-4 py-2.5">WhatsApp</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Site</th>
              <th className="px-4 py-2.5">Stage</th>
              <th className="px-4 py-2.5 text-right">Handoff</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center font-mono text-[11px] text-faint">
                  No leads yet — start this category and the Lead Finder mines it.
                </td>
              </tr>
            )}
            {filtered.map((l) => {
              const link = waLink(l.phone);
              const where = [l.city, l.state].filter(Boolean).join(", ") || "—";
              return (
                <tr key={l.id} className="border-b border-edge/60 transition-colors hover:bg-white/[0.03]">
                  <td className="max-w-[240px] px-4 py-2.5">
                    <div className="truncate font-medium text-white">{l.name || `Lead #${l.id}`}</div>
                    <div className="mt-0.5 font-mono text-[9px] uppercase text-faint">#{l.id} · {l.category}</div>
                  </td>
                  <td className="px-4 py-2.5 text-white/75">{where}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-white/85">{l.phone || "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px]">
                    {l.whatsapp_available === 1 || link ? (
                      <span className="font-bold text-white">✓ ready</span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="max-w-[200px] px-4 py-2.5">
                    <span className="block truncate font-mono text-[11px] text-white/70">{l.admissions_email || l.email || "—"}</span>
                  </td>
                  <td className="max-w-[140px] px-4 py-2.5">
                    {l.website ? (
                      <a href={l.website} target="_blank" rel="noreferrer" className="block truncate text-white/70 underline decoration-edge underline-offset-2 hover:text-white">
                        {l.website.replace(/^https?:\/\/(www\.)?/, "")}
                      </a>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`font-mono text-[10px] uppercase ${l.stage === "done" ? "text-white" : l.stage === "sent" ? "text-white/85" : "text-white/55"}`}>
                      {STAGE_LABEL[l.stage] ?? l.stage}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => openChat(l)}
                        disabled={busy === l.id}
                        className="cursor-pointer border border-white/40 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-white hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {busy === l.id ? "…" : "chat"}
                      </button>
                      <button
                        onClick={() => copyMessage(l)}
                        className="cursor-pointer border border-white/20 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-white/60 hover:border-white hover:text-white"
                      >
                        {copied === l.id ? "✓" : "copy"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-edge px-4 py-2.5 font-mono text-[10px] text-faint">
        <span>{filtered.length} shown</span>
        <span>wa.me handoffs · no API credentials needed</span>
      </div>
    </div>
  );
}