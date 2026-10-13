"use client";

import { useState } from "react";
import { runVerifierNow, useWorkflow, type WorkflowPayload } from "@/lib/client/workflow";

const MAILBOX_TONE: Record<string, string> = {
  exists: "text-emerald-300 bg-emerald-500/10 ring-emerald-500/25",
  catch_all: "text-amber-300 bg-amber-500/10 ring-amber-500/25",
  unverified: "text-slate-400 bg-slate-800/60 ring-slate-700",
  no_mx: "text-rose-300 bg-rose-500/10 ring-rose-500/25",
  rejected: "text-rose-300 bg-rose-500/10 ring-rose-500/25",
};

const SOURCE_LABEL: Record<string, string> = {
  school_website: "School's own website",
  sitemap: "Website sitemap",
  about_page: "About / contact page",
  admission_page: "Admissions page",
  verified_school_site: "Directory → school site",
  osm_tag: "OpenStreetMap tag",
  manual: "Entered by hand",
  unknown: "Unknown source",
};

const SOURCE_TONE: Record<string, string> = {
  school_website: "bg-emerald-400",
  sitemap: "bg-emerald-400/80",
  about_page: "bg-emerald-400/70",
  admission_page: "bg-emerald-400/60",
  verified_school_site: "bg-sky-400",
  osm_tag: "bg-amber-400",
  manual: "bg-slate-500",
  unknown: "bg-slate-600",
};

function inr(n: number) {
  return "₹" + n.toLocaleString("en-IN");
}

function Stat({ label, value, tone = "text-slate-50", hint }: { label: string; value: number | string; tone?: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-edge bg-panel px-4 py-3">
      <div className={`font-mono text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      {hint ? <div className="mt-1 text-[10px] leading-tight text-slate-600">{hint}</div> : null}
    </div>
  );
}

function Section({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-edge bg-panel/70 p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-slate-300">{title}</h2>
          {sub ? <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p> : null}
        </div>
        {right}
      </header>
      {children}
    </section>
  );
}

function Funnel({ funnel }: { funnel: WorkflowPayload["workflow"]["funnel"] }) {
  const max = Math.max(1, ...funnel.map((f) => f.value));
  return (
    <div className="space-y-1.5">
      {funnel.map((f, i) => {
        const pct = (f.value / max) * 100;
        const prev = i > 0 ? funnel[i - 1].value : null;
        const drop = prev && prev > 0 ? Math.round(((prev - f.value) / prev) * 100) : null;
        return (
          <div key={f.label} className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-right text-[11px] text-slate-400">{f.label}</div>
            <div className="h-7 flex-1 overflow-hidden rounded-md bg-void/70">
              <div
                className="flex h-full items-center justify-end rounded-md bg-gradient-to-r from-emerald-600/50 to-emerald-400/70 pr-2 transition-[width] duration-500"
                style={{ width: `${Math.max(pct, f.value > 0 ? 6 : 0)}%` }}
              >
                <span className="font-mono text-[11px] font-semibold tabular-nums text-emerald-50">{f.value.toLocaleString()}</span>
              </div>
            </div>
            <div className="w-12 shrink-0 font-mono text-[10px] tabular-nums text-slate-600">
              {drop !== null && drop > 0 ? `-${drop}%` : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stages({ stages }: { stages: WorkflowPayload["workflow"]["stages"] }) {
  return (
    <div className="divide-y divide-edge/70">
      {stages.map((s, i) => (
        <div key={s.key} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-edge bg-void font-mono text-[10px] text-slate-400">
            {i + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[13px] font-medium text-slate-200">{s.label}</span>
              <span className="font-mono text-[11px] tabular-nums text-slate-500">{s.count.toLocaleString()} total</span>
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{s.note}</p>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {s.sitting > 0 ? (
              <span className="rounded-md bg-slate-800/80 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-slate-300">
                {s.sitting} waiting
              </span>
            ) : null}
            {s.blocked > 0 ? (
              <span className="rounded-md bg-rose-500/10 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-rose-300 ring-1 ring-rose-500/25">
                {s.blocked} blocked
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-32 shrink-0 truncate text-[11px] text-slate-400" title={label}>
        {label}
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-void/70">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </div>
      <div className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-300">{value}</div>
    </div>
  );
}

function AuditTrail({ rows }: { rows: WorkflowPayload["verifications"] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!rows.length) {
    return <p className="py-6 text-center text-[11px] text-slate-600">No verification decisions yet.</p>;
  }
  return (
    <div className="divide-y divide-edge/70">
      {rows.map((v) => {
        let checks: { label: string; pass: boolean; detail: string }[] = [];
        try {
          checks = v.checks_json ? JSON.parse(v.checks_json) : [];
        } catch {
          checks = [];
        }
        const pass = v.status === "verified";
        const isOpen = open === v.id;
        return (
          <div key={v.id} className="py-2">
            <button
              onClick={() => setOpen(isOpen ? null : v.id)}
              className="flex w-full cursor-pointer items-center gap-2 text-left"
            >
              <span
                className={`shrink-0 rounded-md px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ring-1 ${
                  pass ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/25" : "bg-rose-500/10 text-rose-300 ring-rose-500/25"
                }`}
              >
                {pass ? "approved" : "rejected"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-slate-200">{v.institution_name ?? `Lead #${v.institution_id}`}</span>
                <span className="block truncate font-mono text-[10px] text-slate-500">{v.email}</span>
              </span>
              {v.auto_approved ? (
                <span className="shrink-0 font-mono text-[9px] uppercase text-sky-400/80">auto</span>
              ) : (
                <span className="shrink-0 font-mono text-[9px] uppercase text-slate-600">manual</span>
              )}
              <span className="shrink-0 font-mono text-[9px] text-slate-600">{isOpen ? "▾" : "▸"}</span>
            </button>
            {v.reason ? <p className="mt-1 pl-1 text-[11px] leading-snug text-slate-500">{v.reason}</p> : null}
            {isOpen && checks.length ? (
              <div className="mt-1.5 space-y-1 rounded-lg border border-edge bg-void/50 p-2">
                {checks.map((c) => (
                  <div key={c.label} className="flex items-start gap-2 text-[10px]">
                    <span className={c.pass ? "text-emerald-400" : "text-rose-400"}>{c.pass ? "✓" : "✗"}</span>
                    <span className="w-28 shrink-0 text-slate-400">{c.label}</span>
                    <span className="min-w-0 flex-1 text-slate-500">{c.detail}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function WorkflowDashboard() {
  const { data, refresh } = useWorkflow();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function verifyNow() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await runVerifierNow();
      setMsg(`Checked ${r.checked} · approved ${r.approved} · blocked ${r.blocked}`);
      refresh();
    } catch {
      setMsg("Verification run failed — see server logs.");
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <main className="mx-auto max-w-[1500px] px-4 py-10 text-center font-mono text-xs text-slate-500">
        Loading workflow…
      </main>
    );
  }

  const t = data.workflow.totals;
  const mailboxEntries = Object.entries(data.workflow.emailHealth.mailbox).sort((a, b) => b[1] - a[1]);
  const sourceEntries = Object.entries(data.workflow.emailHealth.sources).sort((a, b) => b[1] - a[1]);
  const mailboxMax = Math.max(1, ...mailboxEntries.map(([, v]) => v));
  const sourceMax = Math.max(1, ...sourceEntries.map(([, v]) => v));
  const vc = data.verificationCounts;

  return (
    <main className="mx-auto max-w-[1500px] space-y-4 px-4 py-5">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-edge bg-gradient-to-br from-slate-900 via-panel to-slate-950 p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold ring-1 ${
                !data.engine.autonomous
                  ? "bg-slate-800/60 text-slate-400 ring-slate-700"
                  : data.engine.activeAgents > 0
                    ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                    : "bg-amber-500/10 text-amber-300 ring-amber-500/25"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  !data.engine.autonomous ? "bg-slate-500" : data.engine.activeAgents > 0 ? "anim-pulse bg-emerald-400" : "bg-amber-400"
                }`}
              />
              {!data.engine.autonomous
                ? "ENGINE OFF"
                : data.engine.activeAgents > 0
                  ? `WORKFLOW LIVE · ${data.engine.activeAgents} BOT${data.engine.activeAgents > 1 ? "S" : ""} RUNNING`
                  : "ENGINE IDLE"}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold ring-1 ${
                data.autoApprove
                  ? "bg-sky-500/10 text-sky-300 ring-sky-500/25"
                  : "bg-amber-500/10 text-amber-300 ring-amber-500/25"
              }`}
            >
              {data.autoApprove ? "AUTO APPROVE + SEND ON" : "MANUAL APPROVAL"}
            </span>
          </div>
          <h1 className="mt-2.5 font-mono text-xl font-bold tracking-tight text-slate-50 md:text-2xl">
            Outreach Workflow — every step accounted for
          </h1>
          <p className="mt-1 max-w-3xl text-[11px] leading-relaxed text-slate-400">
            Nothing reaches a school mailbox until the Verifier confirms the address sits on a domain proven to belong to that
            school, the receiving mail server confirms the mailbox exists, and the message quotes the correct price.
          </p>
        </div>
        <div className="rounded-xl border border-edge bg-void/50 px-4 py-3 text-right">
          <div className="font-mono text-lg font-bold text-emerald-400">{inr(data.pricing.setupFee)}</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">one-time, complete system</div>
          <div className="mt-1.5 font-mono text-[11px] text-slate-300">
            + {inr(data.pricing.annualMaintenance)}<span className="text-slate-500">/year maintenance</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="Discovered" value={t.discovered} />
        <Stat label="Real emails" value={t.withRealEmail} tone="text-sky-300" />
        <Stat label="Sites proven" value={t.siteVerified} tone="text-violet-300" />
        <Stat label="Drafts" value={t.draftsWritten} tone="text-slate-200" />
        <Stat label="Verified" value={t.verifiedOk} tone="text-emerald-300" hint={`${vc.rejected ?? 0} rejected`} />
        <Stat label="Sent" value={t.sent} tone="text-emerald-400" hint={t.bounced ? `${t.bounced} bounced` : "no bounces"} />
        <Stat label="Replied" value={t.replied} tone="text-amber-300" hint={`${t.interested} interested`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_1fr]">
        <Section title="Conversion funnel" sub="Where leads drop out of the workflow, step by step.">
          <Funnel funnel={data.workflow.funnel} />
        </Section>
        <Section title="Pipeline" sub="Total handled, how many are waiting, and what is blocked.">
          <Stages stages={data.workflow.stages} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Section title="Mailbox health" sub="What the receiving mail server said about each address.">
          <div className="space-y-1.5">
            {mailboxEntries.length ? (
              mailboxEntries.map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <span
                    className={`w-24 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-[9px] uppercase ring-1 ${
                      MAILBOX_TONE[k] ?? "text-slate-400 bg-slate-800/60 ring-slate-700"
                    }`}
                  >
                    {k.replace("_", " ")}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-void/70">
                    <div
                      className={`h-full rounded-full ${k === "exists" ? "bg-emerald-400" : k === "catch_all" ? "bg-amber-400" : k === "unverified" ? "bg-slate-600" : "bg-rose-400"}`}
                      style={{ width: `${(v / mailboxMax) * 100}%` }}
                    />
                  </div>
                  <div className="w-7 shrink-0 text-right font-mono text-[11px] tabular-nums text-slate-300">{v}</div>
                </div>
              ))
            ) : (
              <p className="py-4 text-center text-[11px] text-slate-600">No addresses stored yet.</p>
            )}
          </div>
        </Section>

        <Section title="Where addresses came from" sub="Provenance of every stored contact.">
          <div className="space-y-1.5">
            {sourceEntries.length ? (
              sourceEntries.map(([k, v]) => (
                <Bar key={k} label={SOURCE_LABEL[k] ?? k} value={v} max={sourceMax} tone={SOURCE_TONE[k] ?? "bg-slate-600"} />
              ))
            ) : (
              <p className="py-4 text-center text-[11px] text-slate-600">No addresses stored yet.</p>
            )}
          </div>
        </Section>

        <Section title="Most-used domains" sub="Domains currently holding a contact address.">
          <div className="space-y-1.5">
            {data.workflow.emailHealth.domains.length ? (
              data.workflow.emailHealth.domains.map((d) => (
                <Bar key={d.domain} label={d.domain} value={d.count} max={data.workflow.emailHealth.domains[0].count} tone="bg-sky-400/80" />
              ))
            ) : (
              <p className="py-4 text-center text-[11px] text-slate-600">No addresses stored yet.</p>
            )}
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Section
          title="Verifier"
          sub="Four checks per draft: address, site ownership, mailbox, pricing."
          right={
            <button
              onClick={verifyNow}
              disabled={busy}
              className="cursor-pointer rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "VERIFYING…" : "RUN VERIFIER NOW"}
            </button>
          }
        >
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Approved" value={vc.verified ?? 0} tone="text-emerald-300" />
            <Stat label="Rejected" value={vc.rejected ?? 0} tone="text-rose-300" />
            <Stat label="Awaiting" value={t.awaitingApproval} tone="text-amber-300" />
          </div>
          <div className="mt-3 space-y-1 border-t border-edge/70 pt-3 text-[11px] text-slate-500">
            <div className="flex justify-between">
              <span>Mailboxes probed (cached)</span>
              <span className="font-mono tabular-nums text-slate-300">{data.verifierCache.mailboxes}</span>
            </div>
            <div className="flex justify-between">
              <span>Domains resolved (cached)</span>
              <span className="font-mono tabular-nums text-slate-300">{data.verifierCache.domains}</span>
            </div>
            <div className="flex justify-between">
              <span>Catch-all domains detected</span>
              <span className="font-mono tabular-nums text-amber-300">{data.verifierCache.catchAllDomains}</span>
            </div>
            <div className="flex justify-between">
              <span>Offer quoted in every message</span>
              <span className="max-w-[60%] truncate text-right font-mono text-slate-300">{data.pricing.summary}</span>
            </div>
          </div>
          {msg ? <p className="mt-3 rounded-md bg-void/60 px-2 py-1.5 font-mono text-[10px] text-slate-300">{msg}</p> : null}
        </Section>

        <Section title="Decision log" sub="The last 60 verification decisions and exactly why they were made.">
          <div className="max-h-[420px] overflow-y-auto pr-1">
            <AuditTrail rows={data.verifications} />
          </div>
        </Section>
      </div>
    </main>
  );
}
