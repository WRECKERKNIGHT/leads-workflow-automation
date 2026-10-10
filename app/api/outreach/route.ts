import { NextRequest, NextResponse } from "next/server";
import { getOutreachItem, updateOutreach, updateInstitution } from "@/lib/db/repo";
import { sendOutreachEmail } from "@/agents/sender";
import { verifyOutreach, runVerifierTask } from "@/agents/verifier";

export const dynamic = "force-dynamic";

/** Approve / reject / edit / verify / send an outreach draft. */
export async function POST(req: NextRequest) {
  const { id, action, body, subject } = await req.json().catch(() => ({}));

  // `verify-all` sweeps the whole queue, so it is the one action that legitimately
  // arrives without an id — the dashboard sends id: 0 for it.
  if (action === "verify-all") {
    const result = await runVerifierTask();
    return NextResponse.json({ ok: true, ...result });
  }

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const item = getOutreachItem(Number(id));
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  switch (action) {
    case "approve":
      // Approving by hand must not be a way around the Verifier: run the same
      // checks rather than just flipping the status, so a human cannot push a
      // draft out that the automated gate would have blocked.
      {
        const verdict = await verifyOutreach(item.id, { apply: true });
        if (!verdict || verdict.status !== "verified") {
          return NextResponse.json(
            { ok: false, error: verdict?.summary ?? "verification failed", verdict },
            { status: 400 }
          );
        }
        return NextResponse.json({ ok: true, item: getOutreachItem(item.id), verdict });
      }
    case "reject":
      updateOutreach(item.id, { status: "rejected" });
      return NextResponse.json({ ok: true, item: getOutreachItem(item.id) });
    case "verify": {
      const verdict = await verifyOutreach(item.id, { apply: true });
      return NextResponse.json({ ok: true, verdict, item: getOutreachItem(item.id) });
    }
    case "edit": {
      const patches: Record<string, string> = { status: "pending_approval" };
      if (typeof body === "string" && body.trim()) patches.body = body;
      if (typeof subject === "string" && subject.trim()) patches.subject = subject;
      // Any edit invalidates a previous verdict — it must be re-checked.
      patches.verified_at = "";
      updateOutreach(item.id, patches);
      return NextResponse.json({ ok: true, item: getOutreachItem(item.id) });
    }
    case "send": {
      const sent = await sendOutreachEmail(item.id);
      return NextResponse.json({ ok: sent.ok, queued: sent.queued, error: sent.error, item: getOutreachItem(item.id) });
    }
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}

export async function GET() {
  const db = (await import("@/lib/db")).getDb();
  const rows = db
    .prepare(
      `SELECT o.*, i.name AS institution_name
       FROM outreach_queue o
       LEFT JOIN institutions i ON i.id = o.institution_id
       WHERE o.status IN ('pending_approval','approved','pending_smtp')
       ORDER BY o.id DESC LIMIT 100`
    )
    .all();
  return NextResponse.json({ items: rows });
}

export async function PATCH(req: NextRequest) {
  const { institutionId, subject, body } = await req.json().catch(() => ({}));
  if (!institutionId) return NextResponse.json({ error: "institutionId required" }, { status: 400 });
  updateInstitution(Number(institutionId), {
    ...(typeof subject === "string" ? { message_subject: subject, message_body: body ?? "" } : {}),
    ...(typeof body === "string" ? { message_body: body } : {}),
  });
  return NextResponse.json({ ok: true });
}