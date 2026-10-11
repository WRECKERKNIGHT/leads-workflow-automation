import type { AgencyState } from "@/lib/client/state";
import { timeStr } from "./ui";

const CLS_HEX: Record<string, string> = {
  interested: "#22c55e",
  curious: "#38bdf8",
  not_interested: "#f43f5e",
  wrong_contact: "#fbbf24",
  unclear: "#a78bfa",
};

const KIND_META: Record<string, { label: string; icon: string; hex: string }> = {
  reply: { label: "Reply", icon: "📥", hex: "#22c55e" },
  bounce: { label: "Bounced", icon: "📭", hex: "#f43f5e" },
  out_of_office: { label: "OOO", icon: "⏳", hex: "#fbbf24" },
  error: { label: "Mail error", icon: "🚨", hex: "#f43f5e" },
  other: { label: "Mail", icon: "📄", hex: "#38bdf8" },
};

function clsLabel(c: string | null): string {
  const map: Record<string, string> = {
    interested: "Interested",
    curious: "Needs info",
    not_interested: "Not interested",
    wrong_contact: "Wrong contact",
    unclear: "Unclear",
  };
  return c ? (map[c] ?? c) : "Classifying…";
}

export default function InboxPanel({ state }: { state: AgencyState | null }) {
  const threads = state?.inbox ?? [];
  return (
    <section className="rounded-xl border border-edge bg-panel">
      <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
        <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-slate-500">Response Manager · Inbox</h3>
        <span className="font-mono text-[10px] text-slate-500">{threads.length} threads</span>
      </div>
      <div className="max-h-[520px] overflow-y-auto p-2">
        {threads.length === 0 && <p className="p-4 text-center text-xs text-slate-500">No replies yet.</p>}
        {threads.map((t: any) => {
          const kind = KIND_META[t.kind ?? "reply"] ?? KIND_META.other;
          const hex = t.classification ? (CLS_HEX[t.classification] ?? CLS_HEX.curious) : kind.hex;
          return (
            <div key={t.id} className="mb-2 rounded-lg border border-edge/70 bg-slate-900/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-100">
                    {t.institution_name || (t.institution_id ? `School #${t.institution_id}` : "Unknown sender")}
                  </div>
                  <div className="truncate text-[11px] text-slate-400">{t.subject}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="text-sm">{kind.icon}</span>
                  <span className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold"
                    style={{ color: hex, background: `${hex}1f`, border: `1px solid ${hex}55` }}>
                    {kind.label}
                  </span>
                  {t.kind === "reply" && (
                    <span className="rounded-full px-2 py-0.5 font-mono text-[10px] font-bold text-slate-300"
                      style={{ color: hex, background: `${hex}14`, border: `1px solid ${hex}33` }}>
                      {clsLabel(t.classification)}
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-2 max-h-20 overflow-y-auto rounded-lg bg-black/30 p-2 text-[11px] leading-relaxed text-slate-300">
                {t.last_body}
              </p>
              <div className="mt-1.5 font-mono text-[10px] text-slate-500">{t.from_addr} · {timeStr(t.created_at)}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}