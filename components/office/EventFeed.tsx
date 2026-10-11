import type { AgencyState } from "@/lib/client/state";
import { timeStr } from "./ui";

function icon(kind: string): string {
  switch (kind) {
    case "lead": return "🔔";
    case "organize": return "🗂️";
    case "research": return "🔍";
    case "opportunity": return "🎯";
    case "demo": return "🎬";
    case "draft": return "📧";
    case "send": return "📤";
    case "reply": return "📱";
    case "classify": return "📱";
    case "needs": return "⚠️";
    case "warning": return "⚠️";
    case "error": return "🔥";
    case "mission": return "🚀";
    case "done": return "✅";
    default: return "•";
  }
}

export default function EventFeed({ state, limit = 40 }: { state: AgencyState | null; limit?: number }) {
  const events = state?.officeEvents ?? [];
  const recent = [...events].reverse().slice(-limit).reverse();
  return (
    <section className="rounded-xl border border-edge bg-panel">
      <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
        <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-slate-500">Live event feed</h3>
        <span className="h-2 w-2 rounded-full bg-emerald-400 anim-pulse" />
      </div>
      <div className="max-h-[520px] overflow-y-auto p-2">
        {recent.length === 0 && <p className="p-4 text-center text-xs text-slate-500">No events yet — launch a mission.</p>}
        {recent.map((e: any) => (
          <div key={e.id} className="flex gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-900/60">
            <span className="text-sm">{e.icon ?? icon(e.kind)}</span>
            <div className="min-w-0">
              <div className="text-[12px] leading-snug text-slate-200">{e.title}</div>
              <div className="font-mono text-[10px] text-slate-500">{e.agent_id} · {timeStr(e.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}