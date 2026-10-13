"use client";

import { useEffect, useState } from "react";

interface BotDTO {
  profile: {
    id: string;
    name: string;
    department: string;
    role: string;
    stageLabel: string;
    description: string;
    skills: string[];
    glyph: string;
  };
  run: {
    status: string;
    current_task: string | null;
    progress: number;
    queue: number;
    last_action: string | null;
    started_at: string | null;
  } | null;
  logs: { id: number; level: string; message: string; created_at: string }[];
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  working: { label: "working", cls: "bg-white text-black" },
  thinking: { label: "thinking", cls: "bg-white/15 text-white" },
  waiting: { label: "waiting", cls: "text-white/50 border border-white/25" },
  reviewing: { label: "reviewing", cls: "text-white/70 border border-white/40" },
  needs_human: { label: "needs human", cls: "text-black bg-white" },
  error: { label: "error", cls: "text-black bg-white" },
  offline: { label: "offline", cls: "text-white/30 border border-white/15" },
};

function timeStr(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function BotProfiles({ embedded = false }: { embedded?: boolean }) {
  const [bots, setBots] = useState<BotDTO[] | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/bots", { cache: "no-store" });
        if (res.ok && alive) setBots((await res.json()).bots as BotDTO[]);
      } catch {
        /* poll */
      }
    };
    tick();
    const t = setInterval(tick, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const active = bots?.filter((b) => b.run && (b.run.status === "working" || b.run.status === "thinking")).length ?? 0;

  const Wrapper = embedded ? "section" : "main";

  return (
    <Wrapper className="mx-auto max-w-[1600px] px-4 py-6 md:px-8">
      <header className="border border-edge bg-panel p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-faint">Workforce register</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-mono text-3xl font-bold uppercase tracking-wide">The bots</h1>
          <div className="flex items-center gap-2 font-mono text-[11px] text-white/70">
            <span className={`h-2 w-2 rounded-full ${active ? "bg-white anim-pulse" : "bg-white/25"}`} />
            {active}/{bots?.length ?? "…"} active on the floor
          </div>
        </div>
        <p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-dim">
          Full profiles below. Each profile card you see on a category dashboard is a shorter slice of these — glyph, name, live status, current task and
          progress.
        </p>
      </header>

      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {embedded && bots && <p className="col-span-full font-mono text-[10px] uppercase tracking-widest text-faint">full profiles below</p>}
        {!bots && [0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-64 animate-pulse rounded-2xl border border-edge bg-panel" />)}
        {bots?.map((b) => {
          const meta = STATUS_META[b.run?.status ?? "waiting"] ?? STATUS_META.waiting;
          const pct = Math.max(0, Math.min(100, Number(b.run?.progress ?? 0)));
          return (
            <article key={b.profile.id} className="flex flex-col rounded-2xl border border-edge bg-panel transition-colors hover:border-white/40">
              <div className="flex items-start justify-between gap-4 border-b border-edge p-5">
                <div className="flex items-center gap-4">
                  <span className="flex h-14 w-14 select-none items-center justify-center border border-white/30 bg-black font-mono text-2xl font-bold text-white">
                    {b.profile.glyph}
                  </span>
                  <div>
                    <h2 className="font-mono text-lg font-bold uppercase tracking-wide text-white">{b.profile.name}</h2>
                    <div className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-faint">
                      {b.profile.role} · {b.profile.department === "tech" ? "tech" : "sales"} · stage {b.profile.stageLabel}
                    </div>
                  </div>
                </div>
                <span className={`shrink-0 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider ${meta.cls}`}>{meta.label}</span>
              </div>

              <div className="flex-1 p-5">
                <p className="text-[13px] leading-relaxed text-white/75">{b.profile.description}</p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {b.profile.skills.map((s) => (
                    <span key={s} className="border border-white/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-white/55">
                      {s}
                    </span>
                  ))}
                </div>

                <div className="mt-4 border-t border-edge pt-4">
                  <div className="flex items-center justify-between font-mono text-[10px] text-faint">
                    <span className="uppercase tracking-wider">current task</span>
                    <span>{timeStr(b.run?.started_at)}</span>
                  </div>
                  <div className="mt-1 truncate text-[12px] text-white/85" title={b.run?.current_task ?? ""}>
                    {b.run?.current_task || "Idle — standing by"}
                  </div>

                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-faint">
                    <span>{pct}% complete</span>
                    <span>queue {Number(b.run?.queue ?? 0)}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-edge px-5 py-3">
                <div className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-faint">recent log</div>
                <div className="space-y-1">
                  {(b.logs?.length ? b.logs.slice(0, 3) : [{ id: 0, level: "info", message: "No activity logged yet.", created_at: "" }]).map((l) => (
                    <div key={l.id} className="flex items-start gap-2 font-mono text-[10px] leading-snug">
                      <span className="mt-0.5 shrink-0 text-faint">{l.created_at?.slice(11, 19) ?? "—"}</span>
                      <span className={l.level === "error" ? "text-white" : l.level === "warn" ? "text-white/80" : "text-white/55"}>{l.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </Wrapper>
  );
}