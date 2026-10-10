import { NextRequest, NextResponse } from "next/server";
import { dashboardStats, listDemos, listAppointments, listInboxThreads, outreachAll, getSetting } from "@/lib/db/repo";
import { getDb } from "@/lib/db";
import { smtpConfigured, runtimeSmtp, mailConfigured } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Full snapshot of everything the office/dashboard needs. */
export async function GET(req: NextRequest) {
  const db = getDb();
  const since = Number(req.nextUrl.searchParams.get("since") ?? "0");

  const institutions = db.prepare("SELECT * FROM institutions ORDER BY id DESC LIMIT 500").all();
  const agentRuns = db.prepare("SELECT * FROM agent_runs").all();
  const logs = db
    .prepare("SELECT * FROM agent_logs ORDER BY id DESC LIMIT 80")
    .all()
    .reverse();
  const pipelineEvents = db
    .prepare("SELECT * FROM pipeline_events WHERE id > ? ORDER BY id LIMIT 300")
    .all(since);
  const officeEvents = db
    .prepare("SELECT * FROM office_events WHERE id > ? ORDER BY id LIMIT 200")
    .all(since);
  const missions = db.prepare("SELECT * FROM missions ORDER BY id DESC LIMIT 20").all();
  const outreach = outreachAll(80);
  const demos = listDemos(100);
  const appointments = listAppointments(100);
  const inbox = listInboxThreads(80);

  const maxOffice = (db.prepare("SELECT COALESCE(MAX(id),0) m FROM office_events").get() as { m: number }).m ?? 0;

  return NextResponse.json({
    stats: dashboardStats(),
    smtp: buildSmtpInfo(),
    mail: {
      configured: mailConfigured(),
      enabled: true,
      lastSyncAt: getSetting("mail.inbox.lastSyncAt"),
      lastUid: getSetting("mail.inbox.lastUid"),
    },
    institutions,
    agentRuns,
    logs,
    pipelineEvents,
    officeEvents,
    missions,
    outreach,
    demos,
    appointments,
    inbox,
    cursor: maxOffice,
  });
}

function buildSmtpInfo() {
  const s = runtimeSmtp();
  return {
    configured: smtpConfigured(),
    host: s.host,
    fromEmail: s.fromEmail,
    senderName: s.fromName,
  };
}