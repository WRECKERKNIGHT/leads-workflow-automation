import { NextRequest, NextResponse } from "next/server";
import { getSetting, setSetting, getAllSettings } from "@/lib/db/repo";
import { runtimeSmtp, smtpConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

const KEYS = ["smtp.host", "smtp.port", "smtp.user", "smtp.pass", "smtp.fromEmail", "smtp.fromName", "sender.name", "sender.role"];

/** Return the effective SMTP state (runtime settings + env fallback). */
export async function GET() {
  const s = runtimeSmtp();
  const overrides = getAllSettings();
  return NextResponse.json({
    smtp: {
      configured: smtpConfigured(),
      host: s.host,
      port: s.port,
      user: s.user,
      passSet: Boolean(s.pass),
      fromEmail: s.fromEmail,
      fromName: s.fromName,
    },
    overrides,
  });
}

/** Save SMTP / profile settings at runtime — no server restart needed. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const saved: string[] = [];
  for (const key of KEYS) {
    if (key in body) {
      const v = String(body[key] ?? "").trim();
      setSetting(key, v);
      saved.push(key);
    }
  }
  return NextResponse.json({ ok: true, saved, smtp: { configured: smtpConfigured() } });
}