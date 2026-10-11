import type { AgencyState } from "@/lib/client/state";
import Link from "next/link";

const FLOW: { stage: string; label: string; icon: string; hex: string }[] = [
  { stage: "discovery", label: "School discovered", icon: "🔍", hex: "#10b981" },
  { stage: "organizer", label: "Contacts organized", icon: "🗂️", hex: "#38bdf8" },
  { stage: "research", label: "Research", icon: "🎯", hex: "#a78bfa" },
  { stage: "opportunity", label: "Find opportunity", icon: "🚀", hex: "#fbbf24" },
  { stage: "demo", label: "Custom demo", icon: "🎬", hex: "#22d3ee" },
  { stage: "message", label: "Personalized message", icon: "💬", hex: "#fb923c" },
  { stage: "sent", label: "Sent", icon: "📤", hex: "#34d399" },
  { stage: "reply", label: "Replies", icon: "📨", hex: "#fb7185" },
  { stage: "done", label: "Done", icon: "✅", hex: "#4ade80" },
];

function RoomCard({ s, count, focus }: { s: (typeof FLOW)[number]; count: number; focus: boolean }) {
  return (
    <div className={`relative rounded-xl border p-3 transition-all ${focus ? "border-emerald-400/60 bg-panel shadow-[0_0_18px_-4px_rgba(34,197,94,0.35)]" : "border-edge bg-panel/60"}`}>
      <div className="flex items-center justify-between">
        <span className="text-lg" style={{ filter: focus ? "none" : "grayscale(0.4)" }}>{s.icon}</span>
        <span className={`font-mono text-xl font-bold ${focus ? "text-emerald-300" : "text-slate-300"}`}>{count}</span>
      </div>
      <div className="mt-1.5 text-[11px] font-semibold leading-tight text-slate-200">{s.label}</div>
      <div className={`mt-1.5 h-1 w-full rounded-full bg-slate-800`}>
        <div className="h-full w-full rounded-full opacity-0" />
      </div>
    </div>
  );
}

export default function PipelineBoard({ state }: { state: AgencyState | null }) {
  const byStage = state?.stats?.byStage ?? {};
  // Highlight the stage with the most live work (exclude sent/done when idle).
  const live = ([
    "discovery", "organizer", "research", "opportunity", "demo", "message",
  ] as const).map((s) => Number(byStage[s] ?? 0));
  const focusStage = live.every((n) => n === 0) ? null : FLOW[live.indexOf(Math.max(...live))].stage;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-slate-500">
          Workflow — discovered → approved → sent
        </h2>
        <Link href="/office" className="font-mono text-[11px] font-semibold text-emerald-400 hover:underline">
          Open operations floor →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
        {FLOW.map((s) => (
          <RoomCard key={s.stage} s={s} count={Number(byStage[s.stage] ?? 0)} focus={s.stage === focusStage} />
        ))}
      </div>
      <div className="mt-2 text-right font-mono text-[10px] text-slate-500">
        ● highlighted = busiest stage right now
      </div>
    </section>
  );
}