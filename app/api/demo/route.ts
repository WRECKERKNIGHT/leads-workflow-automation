import { NextRequest, NextResponse } from "next/server";
import { updateDemo, pushOfficeEvent } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

/** Approve or reject a generated demo facts sheet. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = Number(body.id);
  const action = String(body.action ?? "approve").trim();

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (action === "approve") {
    updateDemo(id, { status: "approved" });
    pushOfficeEvent("done", `✅ Demo approved — ready to reference in outreach`, {
      agentId: "demo_builder",
      icon: "🎬",
    });
    return NextResponse.json({ ok: true, action: "approve" });
  }
  if (action === "reject") {
    updateDemo(id, { status: "rejected" });
    pushOfficeEvent("archive", `🎬 Demo #${id} rejected`, { agentId: "demo_builder", icon: "🔁" });
    return NextResponse.json({ ok: true, action: "reject" });
  }
  return NextResponse.json({ error: "action must be approve | reject" }, { status: 400 });
}