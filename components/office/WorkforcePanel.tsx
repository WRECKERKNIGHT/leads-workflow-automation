import type { AgencyState } from "@/lib/client/state";
import { AGENT_NAMES, AGENT_ICONS, AGENT_STATUS, departmentOf } from "./ui";

const AGENT_ORDER = [
  "lead_finder", "lead_organizer", "research_agent", "opportunity_finder",
  "demo_builder", "message_writer", "email_sender", "reply_manager",
];

function AgentCard({ run }: { run: any }) {
  const status = (run?.status ?? "waiting") as keyof typeof AGENT_STATUS;
  const meta = AGENT_STATUS[status] ?? AGENT_STATUS.waiting;
  const pct = Number(run?.progress ?? 0);
  return (
    <div className="rounded-xl border border-edge bg-panel p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{AGENT_ICONS[run?.agent_id] ?? "🤖"}</span>
          <div>
            <div className="text-sm font-semibold text-slate-100">{AGENT_NAMES[run?.agent_id] ?? run?.agent_id}</div>
            <div className="font-mono text-[10px] text-slate-500">{departmentOf(run?.agent_id)} · {AGENT_NAMES[run?.agent_id]?.toLowerCase()}</div>
          </div>
        </div>
        <span className={`flex items-center gap-1.5 rounded-full px-2 py-1 font-mono text-[10px] font-semibold ${status === "needs_human" ? "bg-violet-500/15 text-violet-300" : ""} ${status === "needs_human" ? "ring-1 ring-violet-500/40" : ""} border border-edge/60`}>
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
      </div>

      <div className="mt-2.5 min-h-[14px] truncate text-[11px] text-slate-400" title={run?.current_task ?? ""}>
        {run?.current_task || "Idle"}
      </div>

      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: meta.hex }}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
        <span>{pct}%</span>
        <span>queue {Number(run?.queue ?? 0)}</span>
      </div>
    </div>
  );
}

export default function WorkforcePanel({ state }: { state: AgencyState | null }) {
  const runs = state?.agentRuns ?? [];
  const byId = new Map<string, any>();
  for (const r of runs) if (!byId.has(r.agent_id)) byId.set(r.agent_id, r);

  const ordered = AGENT_ORDER.map((id) => ({ id, run: byId.get(id) }));
  const working = ordered.filter((o) => o.run?.status === "working" || o.run?.status === "thinking").length;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-slate-500">
          Workforce · 8 agents on the floor
        </h2>
        <div className="flex items-center gap-1.5 text-xs">
          <span className={`flex items-center gap-1.5 rounded-full border border-edge bg-panel px-2 py-1`}>
            <span className={`h-2 w-2 rounded-full ${working ? "bg-emerald-400 anim-pulse" : "bg-amber-400"}`} />
            <span className="font-mono text-[11px] text-slate-300">{working}/8 active</span>
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
        {(["working", "thinking", "waiting", "error", "needs_human"] as const).map((k) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${AGENT_STATUS[k].dot}`} />
            {AGENT_STATUS[k].label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
        {ordered.map(({ run }) => <AgentCard key={run?.agent_id} run={run} />)}
      </div>
    </section>
  );
}