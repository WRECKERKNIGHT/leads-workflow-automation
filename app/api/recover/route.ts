import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db/index";
import { runLeadOrganizer } from "@/agents/organizer";
import { logAgent, pushOfficeEvent } from "@/lib/db/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * Recovery pass for schools that were already contacted with the old,
 * unverified pipeline. It re-runs contact discovery from scratch for exactly
 * those institutions: the stale website is dropped, the school is sent back to
 * the organizer, and every address must now be proven to sit on a domain that
 * belongs to the school before it can be drafted to.
 *
 * Nothing here sends mail — it only re-establishes trustworthy contact data.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Number(body.limit ?? 25), 200);
  const dryRun = body.dryRun === true;
  const db = getDb();

  // Schools we previously contacted: anything with a sent or rejected outreach
  // record, but no usable address left after the quarantine.
  const targets = db
    .prepare(
      `SELECT DISTINCT i.id, i.name, i.state
       FROM institutions i
       JOIN outreach_queue o ON o.institution_id = i.id
       WHERE o.status IN ('sent','rejected','error')
         AND (i.email IS NULL OR i.email = '')
       ORDER BY
         CASE WHEN EXISTS (SELECT 1 FROM outreach_queue o2 WHERE o2.institution_id=i.id AND o2.status='sent') THEN 0 ELSE 1 END,
         i.id
       LIMIT ?`
    )
    .all(limit) as { id: number; name: string; state: string | null }[];

  if (dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, count: targets.length, targets });
  }

  const results: { id: number; name: string; result: string; email?: string; site?: string; reason?: string }[] = [];

  for (const t of targets) {
    // Reset contact state so the organizer starts clean and cannot inherit the
    // address that was previously cleared.
    db.prepare(
      `UPDATE institutions
       SET stage='lead_organizer', folder_status='in_progress', email='', admissions_email='',
           verified_contact=0, site_verified=0, site_match_reason=NULL, mailbox_status='unverified',
           website=NULL, error=NULL
       WHERE id=?`
    ).run(t.id);

    try {
      await runLeadOrganizer(t.id);
    } catch (e) {
      results.push({ id: t.id, name: t.name, result: "error", reason: e instanceof Error ? e.message : String(e) });
      continue;
    }

    const after = db
      .prepare(
        "SELECT email, admissions_email, website, site_verified, site_match_reason, mailbox_status, stage FROM institutions WHERE id=?"
      )
      .get(t.id) as {
      email: string | null;
      admissions_email: string | null;
      website: string | null;
      site_verified: number;
      site_match_reason: string | null;
      mailbox_status: string | null;
      stage: string;
    };

    const addr = after.admissions_email || after.email || "";
    results.push({
      id: t.id,
      name: t.name,
      result: addr ? "contact found" : after.site_verified ? "site proven, no email" : "no trustworthy contact",
      email: addr || undefined,
      site: after.website ?? undefined,
      reason: after.site_match_reason ?? undefined,
    });
  }

  const found = results.filter((r) => r.email).length;
  logAgent("lead_organizer", `Recovery pass: re-checked ${results.length} previously contacted school(s), ${found} now have a verified address`, {
    level: found ? "info" : "warn",
  });
  pushOfficeEvent(
    found ? "step" : "warning",
    `🔄 Recovery pass: ${found}/${results.length} previously contacted school(s) now have a verified address`,
    { agentId: "lead_organizer", icon: "🔄" }
  );

  return NextResponse.json({ ok: true, checked: results.length, withVerifiedEmail: found, results });
}
