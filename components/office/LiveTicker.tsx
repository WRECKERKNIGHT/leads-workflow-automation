import type { AgencyState } from "@/lib/client/state";
import { timeStr } from "./ui";

export default function LiveTicker({ state }: { state: AgencyState | null }) {
  const events = state?.officeEvents ?? [];
  const last = events.slice(-12);
  if (last.length === 0) return null;

  const strip = (s: string) => s.replace(/\n+/g, " ").slice(0, 110);

  return (
    <div className="mb-5 flex items-center gap-3 overflow-hidden rounded-xl border border-edge bg-panel px-4 py-2">
      <div className="flex shrink-0 items-center gap-2 font-mono text-xs">
        <span className="h-2 w-2 rounded-full bg-emerald-400 anim-pulse" />
        <span className="font-bold text-emerald-400">LIVE</span>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div className="anim-ticker flex shrink-0 gap-8 whitespace-nowrap font-mono text-[11px] text-slate-400">
          {last.map((e: any, i) => (
            <span key={`${e.id}-${i}`} className="flex items-center gap-2">
              <span>{e.icon ?? "•"}</span>
              {strip(e.title)} <span className="text-slate-600">{timeStr(e.created_at)}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}