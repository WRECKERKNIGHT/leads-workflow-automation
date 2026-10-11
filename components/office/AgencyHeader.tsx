"use client";
import Link from "next/link";
import { useState } from "react";
import SettingsModal from "./SettingsModal";

export default function AgencyHeader({ smtp, onSettingsSaved }: { smtp?: { configured: boolean; host: string; fromEmail: string; senderName: string }; onSettingsSaved?: () => void }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const cfg = smtp?.configured ?? false;
  const host = smtp?.host ?? "";

  async function testSmtp() {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setResult({ ok: data.ok, msg: data.ok ? `Sent — messageId ${data.messageId ?? "?"}` : (data.error ?? "unknown") });
    } catch {
      setResult({ ok: false, msg: "Network error while testing SMTP" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <header className="mb-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-xl ring-1 ring-emerald-500/30">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2 2 7l10 5 10-5-10-5Z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h1 className="font-mono text-xl font-bold tracking-tight text-slate-50">
              WRECKERAI <span className="text-emerald-400">AGENCY OS</span>
            </h1>
            <p className="text-xs text-slate-400">EduSuite Pro · all-India education automation</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowSettings(true); setResult(null); }}
            className="cursor-pointer rounded-lg border border-edge bg-panel px-3 py-1.5 font-mono text-xs font-semibold text-slate-300 transition-colors hover:border-emerald-400 hover:text-emerald-300"
          >
            ⚙ SETTINGS
          </button>
          <div className="hidden items-center gap-2 rounded-lg border border-edge bg-panel px-3 py-1.5 text-xs md:flex" title="Open Settings to paste your Gmail app password">
            <span className={`h-2.5 w-2.5 rounded-full ${cfg ? "bg-emerald-400 anim-pulse" : "bg-amber-500"}`} />
            <span className={`font-mono ${cfg ? "text-emerald-300" : "text-amber-300"}`}>
              SMTP {cfg ? host || "LIVE" : "not configured"}
            </span>
          </div>
          <button
            onClick={testSmtp}
            disabled={testing || !cfg}
            title={cfg ? `Test sending from ${smtp?.fromEmail}` : "Open Settings to configure SMTP"}
            className="hidden cursor-pointer rounded-lg border border-edge bg-panel px-3 py-1.5 font-mono text-xs font-semibold text-slate-300 transition-colors hover:border-emerald-400 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40 md:block"
          >
            {testing ? "TESTING…" : "TEST EMAIL"}
          </button>
          <nav className="flex items-center gap-1 rounded-lg border border-edge bg-panel p-1 font-mono text-xs">
            <Link href="/" className="rounded-md px-3 py-1.5 font-semibold text-black bg-emerald-400">Workflow</Link>
            <Link href="/office" className="rounded-md px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white">Operations</Link>
            <Link href="/leads" className="rounded-md px-3 py-1.5 text-slate-300 hover:bg-slate-800 hover:text-white">Leads</Link>
          </nav>
        </div>
      </div>

      {result && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-[11px] font-mono ${result.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-rose-500/40 bg-rose-500/10 text-rose-300"}`}>
          {result.ok ? `✅ ${result.msg}` : `❌ ${result.msg}`}
        </div>
      )}

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onSaved={() => { onSettingsSaved?.(); setResult({ ok: true, msg: "Settings saved — SMTP status refreshed" }); }}
      />
    </header>
  );
}