"use client";
import { useEffect, useState } from "react";

interface SmtpInfo {
  configured: boolean;
  host: string;
  port: string;
  user: string;
  passSet: boolean;
  fromEmail: string;
  fromName: string;
}

export default function SettingsModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [info, setInfo] = useState<SmtpInfo | null>(null);
  const [form, setForm] = useState({ host: "", port: "587", user: "", pass: "", fromEmail: "", fromName: "Harshit Mishra - Student" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMsg(null);
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setInfo(d.smtp);
        setForm({
          host: d.smtp.host || "smtp.gmail.com",
          port: String(d.smtp.port || 587),
          user: d.smtp.user || "",
          pass: "",
          fromEmail: d.smtp.fromEmail || "",
          fromName: d.smtp.fromName || "Harshit Mishra - Student",
        });
      })
      .catch(() => setMsg({ ok: false, text: "Could not load settings" }));
  }, [open]);

  async function save() {
    setBusy(true);
    setMsg(null);
    const payload: Record<string, string> = {
      "smtp.host": form.host,
      "smtp.port": form.port,
      "smtp.user": form.user,
      "smtp.fromEmail": form.fromEmail,
      "smtp.fromName": form.fromName,
    };
    if (form.pass.trim()) payload["smtp.pass"] = form.pass.trim();
    try {
      const r = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      setMsg({ ok: d.ok, text: d.ok ? (d.smtp?.configured ? "✅ Saved — SMTP is now LIVE" : "✅ Saved (SMTP still missing something)") : "Save failed" });
      onSaved();
      if (d.ok) fetch("/api/settings", { cache: "no-store" }).then((r2) => r2.json()).then((d2) => setInfo(d2.smtp));
    } catch {
      setMsg({ ok: false, text: "Save failed" });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/smtp/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      setMsg({ ok: d.ok, text: d.ok ? "✅ Test email sent — check " + (form.fromEmail || info?.fromEmail) : "❌ " + (d.error ?? "failed") });
    } catch {
      setMsg({ ok: false, text: "Network error" });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const field = "w-full rounded-lg border border-edge bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-emerald-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-edge bg-panel p-5 shadow-2xl anim-float-up" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-sm font-bold text-slate-100">SMTP / Sender Settings</h2>
          <button onClick={onClose} className="cursor-pointer rounded-md border border-edge px-2 py-1 font-mono text-xs text-slate-400 hover:text-white" aria-label="Close">
            ESC
          </button>
        </div>

        <div className={`mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-mono ${info?.configured ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>
          <span className={`h-2 w-2 rounded-full ${info?.configured ? "bg-emerald-400 anim-pulse" : "bg-amber-400"}`} />
          {info?.configured ? `SMTP LIVE · ${info.host} · from ${info.fromEmail || "(no from)"}` : "SMTP not configured — fill the fields below (Gmail App Password recommended)"}
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[10px] text-slate-500">
            SMTP host
            <input className={field} value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="smtp.gmail.com" />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-slate-500">
            Port
            <input className={field} value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="587" />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-slate-500">
            SMTP username
            <input className={field} value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} placeholder="you@gmail.com" />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-slate-500">
            SMTP app password {info?.passSet && <span className="text-emerald-400">(stored ✓)</span>}
            <input type="password" className={field} value={form.pass} onChange={(e) => setForm({ ...form, pass: e.target.value })} placeholder={info?.passSet ? "•••••••• (keep blank to keep current)" : "16-char Gmail App Password"} />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-slate-500">
            From email
            <input className={field} value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} placeholder="you@gmail.com" />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-slate-500">
            From name
            <input className={field} value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} />
          </label>
        </div>

        {msg && (
          <p className={`mt-3 rounded-lg border px-3 py-2 text-[11px] font-mono ${msg.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-rose-500/40 bg-rose-500/10 text-rose-300"}`}>
            {msg.text}
          </p>
        )}

        <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
          Gmail App Password: enable 2-Step Verification at myaccount.google.com → Security → App passwords → generate one for &quot;Mail&quot;. It&apos;s 16 letters, no spaces. Settings are saved to the local database instantly — no server restart needed.
        </p>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={test} disabled={busy} className="cursor-pointer rounded-lg border border-edge px-3 py-2 font-mono text-xs text-slate-300 hover:border-emerald-400 hover:text-emerald-300 disabled:opacity-40">
            TEST EMAIL
          </button>
          <button onClick={save} disabled={busy} className="cursor-pointer rounded-lg bg-emerald-500 px-4 py-2 font-mono text-xs font-bold text-black hover:bg-emerald-400 disabled:opacity-40">
            {busy ? "…" : "SAVE SETTINGS"}
          </button>
        </div>
      </div>
    </div>
  );
}