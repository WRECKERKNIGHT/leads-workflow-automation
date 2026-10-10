import { NextRequest, NextResponse } from "next/server";
import { getInstitution, updateInstitution, pushOfficeEvent } from "@/lib/db/repo";
import { resumeInstitution } from "@/agents/pipeline";

export const dynamic = "force-dynamic";

/** Fill in a missing contact on a folder, then sprint it down the pipeline. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ ok: false, error: "Missing institution id" }, { status: 400 });

  const inst = getInstitution(id);
  if (!inst) return NextResponse.json({ ok: false, error: "Institution not found" }, { status: 404 });

  const patch: Record<string, string | number> = {};
  if (typeof body.phone === "string" && body.phone.trim()) patch.phone = body.phone.trim();
  if (typeof body.email === "string" && body.email.trim()) patch.email = body.email.trim();
  if (typeof body.website === "string" && body.website.trim()) patch.website = body.website.trim();
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "Provide a phone, email or website" }, { status: 400 });
  }

  updateInstitution(id, patch);
  pushOfficeEvent("human", `✍️ ${inst.name} — contact filled in, sprinting the pipeline`, {
    agentId: "lead_organizer",
    icon: "✍️",
  });

  const stage = await resumeInstitution(id);
  const after = getInstitution(id);
  return NextResponse.json({ ok: true, institution: after, stage });
}