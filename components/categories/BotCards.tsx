"use client";

import { BOT_PROFILES } from "@/agents/types";

interface AgentRun {
  agent_id: string;
  status: string;
  current_task: string | null;
  progress: number;
  queue: number;
  last_action: string | null;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  working: { label: "working", cls: "bg-white text-black" },
  thinking: { label: "thinking", cls: "bg-white/15 text-white" },
  waiting: { label: "waiting", cls: "text-white/50 border border-white/25" },
  reviewing: { label: "reviewing", cls: "text-white/70 border border-white/40" },
  needs_human: { label: "needs human", cls: "text-white bg-white/10 border border-white/50" },
  error: { label: "error", cls: "text-black bg-white" },
  offline: { label: "offline", cls: "text-white/30 border border-white/15" },
};

export default function BotCards({ runs }: { runs: AgentRun[] }) {
  const byId = new Map<string, AgentRun>();
  for (const r of runs) if (r && !byId.has(r.agent_id)) byId.set(r.agent_id, r);

  const active = [...byId.values()].filter((r) => r.status === "working" || r.status === "thinking").length;

  return (
    <div className="rounded-2xl border border-edge bg-panel">
      <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-3">
        <div>
          <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-white">Bot floor</h3>
          <p className="mt-0.5 text-[11px] text-faint">Live profile cards — shorter slice of each bot&apos;s full profile.</p>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-white/70">
          <span className={`h-2 w-2 rounded-full ${active ? "bg-white anim-pulse" : "bg-white/25"}`} />
          {active}/{BOT_PROFILES.length} active
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 p-4 sm:grid-cols-3 xl:grid-cols-5">
        {BOT_PROFILES.map((b) => {
          const run = byId.get(b.id);
          const meta = STATUS_META[run?.status ?? "waiting"] ?? STATUS_META.waiting;
          const pct = Math.max(0, Math.min(100, Number(run?.progress ?? 0)));
          return (
            <div key={b.id} className="group border border-edge bg-black p-3 transition-colors hover:border-white/50">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center border border-white/25 font-mono text-[11px] font-bold text-white">
                    {b.glyph}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold text-white">{b.name}</div>
                    <div className="font-mono text-[9px] uppercase tracking-wider text-faint">{b.role}</div>
                  </div>
                </div>
                <span className={`shrink-0 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider ${meta.cls}`}>
                  {meta.label}
                </span>
              </div>

              <div className="mt-2.5 min-h-[28px] truncate text-[11px] leading-snug text-white/60" title={run?.current_task ?? ""}>
                {run?.current_task || "Idle — standing by"}
              </div>

              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[9px] text-faint">
                <span>{pct}%</span>
                <span>queue {Number(run?.queue ?? 0)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}