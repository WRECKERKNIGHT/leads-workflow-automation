import type { AgencyState } from "@/lib/client/state";

function Stat({ label, value, hex, hint, icon }: { label: string; value: number; hex: string; hint?: string; icon: string }) {
  return (
    <div className="rounded-xl border border-edge bg-panel p-3.5 transition-colors hover:border-slate-600">
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider text-slate-500">{label}</span>
        <span className="text-sm" style={{ filter: "grayscale(0.3)" }}>{icon}</span>
      </div>
      <div className="mt-1 font-mono text-2xl font-bold" style={{ color: hex }}>
        {value.toLocaleString("en-IN")}
      </div>
      {hint && <div className="mt-0.5 truncate text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}

export default function CommandCenter({ state }: { state: AgencyState | null }) {
  const s = state?.stats;
  if (!s) return null;
  return (
    <section className="mb-5">
      <h2 className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-slate-500">Command center</h2>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8">
        <Stat icon="🏫" label="Total leads" value={s.totalLeads} hex="#38bdf8" hint={`${s.leadsToday} discovered today`} />
        <Stat icon="🗂️" label="With contacts" value={state?.institutions?.filter((i) => i.email || i.phone).length ?? 0} hex="#22d3ee" hint="email / phone found" />
        <Stat icon="⚠️" label="Awaiting approval" value={s.pendingApproval} hex="#fbbf24" hint="drafted emails" />
        <Stat icon="🎬" label="Demos built" value={s.demos} hex="#a78bfa" />
        <Stat icon="📤" label="Emails sent" value={s.sent} hex="#22c55e" hint="via SMTP" />
        <Stat icon="📱" label="Replies" value={s.replies.replies} hex="#f472b6" hint={`${s.replies.interested} interested`} />
        <Stat icon="🚀" label="Opps found" value={s.highPriorityOpportunities} hex="#fb923c" hint="no-app / no-website" />
        <Stat icon="✅" label="Done" value={Number(s.byStage.done ?? 0)} hex="#4ade80" hint="closed / won" />
      </div>
    </section>
  );
}