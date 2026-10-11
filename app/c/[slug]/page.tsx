"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import WorkflowWires from "@/components/categories/WorkflowWires";
import LeadTable from "@/components/categories/LeadTable";
import BotCards from "@/components/categories/BotCards";

interface CategoryPayload {
  category: string;
  meta: { slug: string; glyph: string; pitch: string; offer: string; overpassTags: string[] };
  active: boolean;
  stats: {
    total: number;
    today: number;
    withPhone: number;
    withWhatsApp: number;
    withEmail: number;
    withWebsite: number;
    sent: number;
    pendingApproval: number;
    replied: number;
    interested: number;
    done: number;
    bounced: number;
    verifiedOk: number;
    highPriority: number;
  };
  byStage: Record<string, number>;
  latestMission: { id: number; region: string; status: string; created_at: string; finished_at: string | null } | null;
  leads: any[];
  agents: any[];
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`border px-4 py-3 ${strong ? "border-white bg-white text-black" : "border-edge bg-panel"}`}>
      <div className={`font-mono text-2xl font-bold tabular-nums ${strong ? "text-black" : "text-white"}`}>{value.toLocaleString("en-IN")}</div>
      <div className={`mt-0.5 text-[9px] uppercase tracking-widest ${strong ? "text-black/60" : "text-faint"}`}>{label}</div>
    </div>
  );
}

export default function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const [slug, setSlug] = useState<string | null>(null);
  const [data, setData] = useState<CategoryPayload | null>(null);
  const [notFoundFlag, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    params.then((p) => setSlug(p.slug));
  }, [params]);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/categories/${slug}`, { cache: "no-store" });
        if (!alive) return;
        if (res.status === 404) setNotFound(true);
        else if (res.ok) setData((await res.json()) as CategoryPayload);
      } catch {
        /* poll continues */
      }
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [slug]);

  if (!slug) return null;
  if (notFoundFlag) return notFound();
  if (!data) {
    return <main className="mx-auto max-w-[1600px] px-4 py-16 text-center font-mono text-xs text-white/50">Loading {slug} dashboard…</main>;
  }

  async function activate() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/categories/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: data!.category, launch: true }),
      });
      const out = await res.json();
      setMsg(out.ok ? "Running — mission launched." : "Engine will pick this up on the next tick.");
      setData({ ...data!, active: true });
    } catch {
      setMsg("Start failed.");
    } finally {
      setBusy(false);
    }
  }

  const s = data.stats;
  const wireCounts: Record<string, number> = {
    ...data.byStage,
    sent: s.sent,
    done: s.done,
  };

  return (
    <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 md:px-8">
      {/* header */}
      <header className="flex flex-wrap items-start justify-between gap-6 border border-edge bg-panel p-6">
        <div className="flex items-start gap-5">
          <div className="flex h-20 w-20 shrink-0 select-none items-center justify-center border border-white/30 bg-black font-mono text-4xl font-bold text-white">
            {data.meta.glyph}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-mono text-2xl font-bold uppercase tracking-wide text-white">{data.category}</h1>
              <span
                className={`border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${
                  data.active ? "border-white bg-white text-black" : "border-white/40 text-white/60"
                }`}
              >
                {data.active ? "● running" : "idle"}
              </span>
            </div>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-snug text-dim">{data.meta.pitch}</p>
            <p className="mt-2 max-w-2xl font-mono text-[11px] text-faint">
              offer → <span className="text-white/70">{data.meta.offer}</span>
            </p>
            {data.latestMission ? (
              <p className="mt-2 font-mono text-[10px] text-faint">
                last mission #{data.latestMission.id} · {data.latestMission.region} · status {data.latestMission.status}
              </p>
            ) : (
              <p className="mt-2 font-mono text-[10px] text-faint">no mission run yet for this category</p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2">
            <a
              href={`/api/categories/${data.meta.slug}/export?format=csv`}
              className="cursor-pointer border border-white/50 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-white hover:bg-white hover:text-black"
            >
              ⌄ export csv
            </a>
            <a
              href={`/api/categories/${data.meta.slug}/export?format=json`}
              className="cursor-pointer border border-white/25 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-white/70 hover:border-white hover:text-white"
            >
              json
            </a>
            <button
              onClick={activate}
              disabled={data.active || busy}
              className={`cursor-pointer border px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors disabled:cursor-not-allowed ${
                data.active ? "border-white/25 text-white/40" : "border-white bg-black text-white hover:border-white hover:bg-white hover:text-black"
              }`}
            >
              {busy ? "starting…" : data.active ? "running" : "start category"}
            </button>
          </div>
          {msg ? <p className="font-mono text-[10px] text-white/70">{msg}</p> : null}
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-faint">
            <span className="flow-dash inline-block h-px w-6 bg-white/60" />
            mined from OpenStreetMap · all-India
          </div>
        </div>
      </header>

      {/* stats */}
      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="Total leads" value={s.total} strong />
        <Stat label="Found today" value={s.today} />
        <Stat label="With phone" value={s.withPhone} />
        <Stat label="WhatsApp ready" value={s.withWhatsApp} strong={s.withWhatsApp > 0} />
        <Stat label="With email" value={s.withEmail} />
        <Stat label="With website" value={s.withWebsite} />
        <Stat label="Done" value={s.done} />
      </section>
      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Messages sent" value={s.sent} />
        <Stat label="Awaiting approval" value={s.pendingApproval} />
        <Stat label="Replied" value={s.replied} />
        <Stat label="Interested" value={s.interested} />
        <Stat label="Verified ok" value={s.verifiedOk} />
        <Stat label="High priority" value={s.highPriority} />
        <Stat label="Bounced" value={s.bounced} />
        <Stat label="Leads today flow" value={s.today} />
      </section>

      {/* wired workflow */}
      <WorkflowWires counts={wireCounts} />

      {/* bots + leads */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <LeadTable slug={data.meta.slug} leads={data.leads} total={s.total} />
        </div>
        <BotCards runs={data.agents} />
      </div>

      <footer className="font-mono text-[10px] uppercase tracking-widest text-faint">
        WhatsApp-first · email smtp stays · one category runs at a time
      </footer>
    </main>
  );
}