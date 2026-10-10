import { NextRequest, NextResponse } from "next/server";
import { receiveInboundReply } from "@/agents/sender";
import { classifyReply } from "@/agents/replies";
import { updateInstitution, pushOfficeEvent, getInstitution } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

/** Ingest an inbound reply (classify) or take an action on a warm lead. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "ingest").trim();

  if (action === "classify") {
    const threadId = Number(body.threadId);
    if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });
    const classification = await classifyReply(threadId);
    return NextResponse.json({ ok: true, classification });
  }

  if (action === "archive") {
    const id = Number(body.institutionId);
    if (!id) return NextResponse.json({ error: "institutionId required" }, { status: 400 });
    const inst = getInstitution(id);
    updateInstitution(id, { stage: "done", folder_status: "ready", error: null });
    pushOfficeEvent("archive", `🗃️ ${inst?.name ?? `#${id}`} archived`, { agentId: "reply_manager", icon: "🗃️" });
    return NextResponse.json({ ok: true });
  }

  const text = String(body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "body required" }, { status: 400 });
  const institutionId = body.institutionId ? Number(body.institutionId) : 0;
  const subject = body.subject ? String(body.subject) : "Reply received";
  const fromAddr = body.from ? String(body.from) : "unknown@inbox.in";
  const threadId = await receiveInboundReply(institutionId, subject, fromAddr, text);
  return NextResponse.json({ ok: true, thread_id: threadId });
}