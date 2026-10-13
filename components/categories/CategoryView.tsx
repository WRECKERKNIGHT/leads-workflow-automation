"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import WorkflowWires from "@/components/categories/WorkflowWires";
import LeadTable from "@/components/categories/LeadTable";
import BotCards from "@/components/categories/BotCards";
import BotProfiles from "@/components/bots/BotProfiles";

export type CategoryViewKind = "overview" | "leads" | "workflow" | "bots";

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

const TABS: { key: CategoryViewKind; label: string; path: string }[] = [
  { key: "overview", label: "Overview", path: "" },
  { key: "leads", label: "Leads", path: "/leads" },
  { key: "workflow", label: "Workflow", path: "/workflow" },
  { key: "bots", label: "Bots", path: "/bots" },
];

const STAGE_LABEL: Record<string, string> = {
  discovery: "Discovered",
  organizer: "Contacts",
  research: "Research",
  opportunity: "Opportunity",
  demo: "Demo",
  message: "Message",
  sent: "Sent",
  done: "Done",
};

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`border px-4 py-3 ${strong ? "border-white bg-white text-black" : "border-edge bg-panel"}`}>
      <div className={`font-mono text-2xl font-bold tabular-nums ${strong ? "text-black" : "text-white"}`}>{value.toLocaleString("en-IN")}</div>
      <div className={`mt-0.5 text-[9px] uppercase tracking-widest ${strong ? "text-black/60" : "text-faint"}`}>{label}</div>
    </div>
  );
}

function Panel({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border border-edge bg-panel">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-edge px-4 py-3">
        <div>
          <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-white">{title}</h3>
          {sub ? <p className="mt-0.5 text-[11px] text-faint">{sub}</p> : null}
        </div>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function CategoryView({ view }: { view: CategoryViewKind }) {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug;
  const [data, setData] = useState<CategoryPayload | null>(null);
  const [notFoundFlag, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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
      router.refresh();
    } catch {
      setMsg("Start failed.");
    } finally {
      setBusy(false);
    }
  }

  const s = data.stats;
  const wireCounts: Record<string, number> = { ...data.byStage, sent: s.sent, done: s.done };

  return (
    <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 md:px-8">
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

      <nav className="flex flex-wrap items-center gap-1 border border-edge bg-black p-1.5">
        {TABS.map((t) => {
          const active = t.key === view;
          return (
            <Link
              key={t.key}
              href={`/c/${data.meta.slug}${t.path}`}
              className={`px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition-colors ${
                active ? "bg-white text-black" : "text-white/55 hover:bg-white/10 hover:text-white"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
        <span className="ml-auto hidden pr-2 font-mono text-[10px] text-faint sm:inline">category workspace</span>
      </nav>

      {view === "overview" && <Overview data={data} wireCounts={wireCounts} />}
      {view === "leads" && <LeadTable slug={data.meta.slug} leads={data.leads} total={s.total} />}
      {view === "workflow" && <WorkflowDetail data={data} wireCounts={wireCounts} />}
      {view === "bots" && (
        <div className="space-y-5">
          <BotCards runs={data.agents} />
          <BotProfiles embedded />
        </div>
      )}

      <footer className="font-mono text-[10px] uppercase tracking-widest text-faint">
        WhatsApp-first · email smtp stays · one category runs at a time
      </footer>
    </main>
  );
}

function Overview({ data, wireCounts }: { data: CategoryPayload; wireCounts: Record<string, number> }) {
  const s = data.stats;
  const stages = Object.entries(STAGE_LABEL).map(([key, label]) => ({ key, label, count: wireCounts[key] ?? 0 }));
  const maxStage = Math.max(1, ...stages.map((x) => x.count));

  return (
    <>
      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Total leads" value={s.total} strong />
        <Stat label="With phone" value={s.withPhone} />
        <Stat label="WhatsApp ready" value={s.withWhatsApp} strong={s.withWhatsApp > 0} />
        <Stat label="Messages sent" value={s.sent} />
        <Stat label="Awaiting approval" value={s.pendingApproval} />
        <Stat label="Done" value={s.done} />
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel
          title="Pipeline at a glance"
          sub="Leads sitting in each stage right now."
          right={
            <Link
              href={`/c/${data.meta.slug}/workflow`}
              className="cursor-pointer border border-white/30 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-white hover:border-white hover:bg-white hover:text-black"
            >
              open workflow →
            </Link>
          }
        >
          <div className="space-y-2">
            {stages.map((st) => (
              <div key={st.key} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-right font-mono text-[10px] uppercase tracking-wider text-faint">{st.label}</div>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-white" style={{ width: `${(st.count / maxStage) * 100}%` }} />
                </div>
                <div className="w-12 shrink-0 text-right font-mono text-[11px] tabular-nums text-white/80">{st.count.toLocaleString("en-IN")}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title="Bot floor"
          sub="Live profile cards for this category's agents."
          right={
            <Link
              href={`/c/${data.meta.slug}/bots`}
              className="cursor-pointer border border-white/30 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-white hover:border-white hover:bg-white hover:text-black"
            >
              full profiles →
            </Link>
          }
        >
          <BotCards runs={data.agents} />
        </Panel>
      </div>

      <LeadTable slug={data.meta.slug} leads={data.leads.slice(0, 10)} total={s.total} compact />
    </>
  );
}

function WorkflowDetail({ data, wireCounts }: { data: CategoryPayload; wireCounts: Record<string, number> }) {
  const s = data.stats;
  const stages = Object.entries(STAGE_LABEL).map(([key, label]) => ({ key, label, count: wireCounts[key] ?? 0 }));

  return (
    <>
      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Discovered" value={s.total} />
        <Stat label="With phone" value={s.withPhone} />
        <Stat label="WhatsApp ready" value={s.withWhatsApp} />
        <Stat label="With email" value={s.withEmail} />
        <Stat label="With website" value={s.withWebsite} />
        <Stat label="Messages sent" value={s.sent} />
        <Stat label="Verified ok" value={s.verifiedOk} />
        <Stat label="Done" value={s.done} />
      </section>

      <WorkflowWires counts={wireCounts} />

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Panel title="Stage breakdown" sub="Total handled per stage, plus what is waiting or blocked.">
          <div className="divide-y divide-edge/70">
            {stages.map((st, i) => (
              <div key={st.key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-edge bg-void font-mono text-[10px] text-slate-400">
                  {i + 1}
                </div>
                <span className="min-w-0 flex-1 text-[13px] font-medium text-slate-200">{st.label}</span>
                <span className="font-mono text-[11px] tabular-nums text-slate-400">{st.count.toLocaleString("en-IN")} total</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Outcome counters" sub="Everything the workflow has produced for this category.">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Stat label="Replied" value={s.replied} />
            <Stat label="Interested" value={s.interested} />
            <Stat label="Awaiting approval" value={s.pendingApproval} />
            <Stat label="High priority" value={s.highPriority} />
            <Stat label="Bounced" value={s.bounced} />
            <Stat label="Found today" value={s.today} />
          </div>
        </Panel>
      </section>
    </>
  );
}
