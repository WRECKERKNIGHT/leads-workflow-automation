"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface CategoryDTO {
  value: string;
  slug: string;
  glyph: string;
  pitch: string;
  offer: string;
  overpassTags: string[];
  active: boolean;
  stats: {
    total: number;
    withPhone: number;
    withWhatsApp: number;
    withEmail: number;
    sent: number;
    replied: number;
    done: number;
  };
  latestMission: { id: number; region: string; status: string; created_at: string } | null;
}

interface Payload {
  active: string;
  autonomous: boolean;
  categories: CategoryDTO[];
}

export default function CategorySelector() {
  const [data, setData] = useState<Payload | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/categories", { cache: "no-store" });
        if (res.ok && alive) setData((await res.json()) as Payload);
      } catch {
        /* server not up yet */
      }
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  async function activate(slug: string) {
    setBusySlug(slug);
    setMsg(null);
    try {
      const res = await fetch("/api/categories/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: data?.categories.find((c) => c.slug === slug)?.value, launch: true }),
      });
      const out = (await res.json()).ok ? "Switched on and mission launched." : "Already starting. The engine picks it up on the next tick.";
      setMsg(out);
      const tick = await fetch("/api/categories", { cache: "no-store" });
      if (tick.ok) setData(await tick.json());
    } catch {
      setMsg("Start failed — is the server running?");
    } finally {
      setBusySlug(null);
    }
  }

  const cats = data?.categories ?? [];
  const active = data?.active ?? "";
  const totalLeads = cats.reduce((s, c) => s + (c.stats?.total ?? 0), 0);

  return (
    <main className="relative min-h-[calc(100vh-49px)] overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-70" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-white/[0.04] blur-3xl" />

      <div className="relative mx-auto max-w-[1500px] px-4 pb-16 pt-12 md:px-8">
        {/* hero */}
        <section className="border-b border-edge pb-10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-faint">Leads · WhatsApp-first · Export-ready</p>
              <h1 className="mt-3 max-w-3xl font-mono text-4xl font-bold leading-[0.95] tracking-tight md:text-6xl">
                One category.
                <br />
                One army.
                <br />
                <span className="text-white/40">Zero noise.</span>
              </h1>
            </div>
            <div className="flex flex-col gap-2 border border-edge bg-panel p-4">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-faint">
                <span className={`h-1.5 w-1.5 rounded-full ${data ? "bg-white anim-pulse" : "bg-white/20"}`} />
                {data?.autonomous ? "engine online" : "engine offline"}
              </div>
              <div className="font-mono text-3xl font-bold tabular-nums">{totalLeads.toLocaleString("en-IN")}</div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-faint">leads in the vault</div>
            </div>
          </div>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-dim">
            You pick the vertical. The force mines it across India, captures <span className="text-white">name · number · location · category</span> on
            every lead, organises WhatsApp handoffs and hands you a complete export for manual approaching. One category runs at a time — your call, always.
          </p>
          {msg ? <p className="mt-4 inline-block border border-white/30 bg-panel px-3 py-1.5 font-mono text-[11px] text-white">{msg}</p> : null}
        </section>

        {/* category rows */}
        <section className="mt-8 flex flex-col gap-3">
          {cats.length === 0 &&
            [0, 1, 2, 3, 4].map((i) => <div key={i} className="h-28 animate-pulse rounded border border-edge bg-panel" />)}
          {cats.map((c) => {
            const isActive = c.active || active === c.value;
            return (
              <article
                key={c.value}
                className={`group relative flex flex-col gap-4 overflow-hidden border p-5 transition-all duration-300 md:flex-row md:items-center md:gap-8 md:p-6 ${
                  isActive ? "border-white bg-white text-black" : "border-edge bg-panel hover:border-white/60"
                }`}
              >
                <div
                  className={`flex h-20 w-20 shrink-0 select-none items-center justify-center font-mono text-4xl font-bold md:h-24 md:w-24 md:text-5xl ${
                    isActive ? "bg-black text-white" : "bg-white/5 text-white/80 group-hover:bg-black group-hover:text-white"
                  }`}
                >
                  {c.glyph}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className={`font-mono text-xl font-bold uppercase tracking-wider md:text-2xl ${isActive ? "text-black" : "text-white"}`}>
                      {c.value}
                    </h2>
                    <span
                      className={`border px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-widest ${
                        isActive ? "border-black bg-black text-white" : "border-white/40 text-white/70"
                      }`}
                    >
                      {isActive ? "● Running" : "Idle"}
                    </span>
                  </div>
                  <p className={`mt-1.5 max-w-xl text-[13px] leading-snug ${isActive ? "text-black/70" : "text-dim"}`}>{c.pitch}</p>
                  <div className={`mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] tabular-nums ${isActive ? "text-black/70" : "text-faint"}`}>
                    <span>{c.stats?.total ?? 0} leads</span>
                    <span>{c.stats?.withPhone ?? 0} phones</span>
                    <span className={c.stats?.withWhatsApp ? "text-inherit" : ""}>{c.stats?.withWhatsApp ?? 0} whatsapp-ready</span>
                    <span>{c.stats?.sent ?? 0} sent</span>
                    <span>{c.stats?.done ?? 0} done</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <button
                    onClick={() => activate(c.slug)}
                    disabled={isActive || busySlug !== null}
                    className={`cursor-pointer border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                      isActive
                        ? "border-black text-black/50"
                        : "border-white/50 text-white hover:border-white hover:bg-white hover:text-black"
                    } disabled:cursor-not-allowed`}
                  >
                    {busySlug === c.slug ? "starting…" : isActive ? "running" : "start"}
                  </button>
                  <Link
                    href={`/c/${c.slug}`}
                    className={`cursor-pointer border px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                      isActive ? "border-black text-black hover:bg-black hover:text-white" : "border-white/30 text-white hover:border-white hover:bg-white hover:text-black"
                    }`}
                  >
                    open →
                  </Link>
                </div>
              </article>
            );
          })}
        </section>

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-5 font-mono text-[10px] uppercase tracking-widest text-faint">
          <span>WreckerAI — leads workflow automation</span>
          <span className="hidden md:inline">email smtp stays · whatsapp-first handoff · export builds the manual list</span>
        </footer>
      </div>
    </main>
  );
}