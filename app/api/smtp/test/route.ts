import { NextRequest, NextResponse } from "next/server";
import { smtpConfigured, runtimeSmtp } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * Test the SMTP connection by sending a real confirmation email to the
 * configured FROM address. Uses runtime dashboard settings when present.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const s = runtimeSmtp();
  const to = String(body.to ?? s.fromEmail).trim();

  if (!smtpConfigured()) {
    return NextResponse.json(
      { ok: false, error: "SMTP not configured — set host/user/pass/from in Settings on the dashboard, or in .env.local" },
      { status: 400 }
    );
  }

  if (s.pass.length < 8) {
    return NextResponse.json(
      { ok: false, error: "SMTP password looks too short for a Gmail App Password (should be 16 characters, no spaces). Generate one at myaccount.google.com/apppasswords." },
      { status: 400 }
    );
  }

  const nodemailer = await import("nodemailer");
  const transporter = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    auth: { user: s.user, pass: s.pass },
  });

  try {
    const info = await transporter.sendMail({
      from: `"${s.fromName}" <${s.fromEmail}>`,
      to,
      subject: "AgencyOS — SMTP connection test",
      text: `SMTP connection works.\n\nHost: ${s.host}:${s.port}\nSender: ${s.fromName} <${s.fromEmail}>\nTime: ${new Date().toISOString()}`,
    });
    return NextResponse.json({ ok: true, accepted: info.accepted, messageId: info.messageId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const hint =
      /application-specific/i.test(msg) || /app password/i.test(msg)
        ? " — your password must be a Gmail App Password, not your normal Gmail password."
        : /535|authorization|credentials/i.test(msg)
          ? " — bad username or password. Re-check the SMTP user and app password."
          : /ECONN/i.test(msg)
            ? ` — could not reach ${s.host}:${s.port}. Check internet / firewall.`
            : "";
    return NextResponse.json({ ok: false, error: msg + hint }, { status: 400 });
  }
}