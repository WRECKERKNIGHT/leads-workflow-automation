import { NextRequest, NextResponse } from "next/server";
import { processQueues, resumeInstitution } from "@/agents/pipeline";
import { runDiscovery, INDIA_STATES } from "@/agents/discovery";
import type { DiscoveryFilters } from "@/agents/discovery";
import { getDb } from "@/lib/db";
import { CATEGORY_CONFIG } from "@/agents/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "start").trim();

  if (action === "process") {
    const res = await processQueues();
    return NextResponse.json({ ok: true, progressed: res.progressed });
  }

  if (action === "resume") {
    const id = Number(body.id);
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const stage = await resumeInstitution(id);
    return NextResponse.json({ ok: true, id, stage });
  }

  const state = String(body.state ?? "").trim();
  const category = String(body.category ?? "School").trim();
  const limit = Math.min(120, Math.max(1, Number(body.limit ?? 40) || 40));
  const filters = (body.filters && typeof body.filters === "object" ? body.filters : {}) as DiscoveryFilters;

  const states = state ? [state] : INDIA_STATES;
  const validCategory = CATEGORY_CONFIG.some((c) => c.value === category);
  if (!validCategory) {
    return NextResponse.json({ error: `category must be one of ${CATEGORY_CONFIG.map((c) => c.value).join(", ")}` }, { status: 400 });
  }

  getDb()
    .prepare("INSERT INTO agent_logs (agent_id, mission_id, message) VALUES ('lead_finder', NULL, ?)")
    .run(`Mission queued: ${category}s across ${states.slice(0, 3).join(", ")}${state ? "" : " (all India)"} · limit ${limit}`);

  const missions: number[] = [];
  for (const s of states.slice(0, 4)) {
    const id = await runDiscovery({ state: s, category, limit, filters });
    if (id) missions.push(id);
  }

  (async () => {
    await processQueues();
  })().catch(() => {});

  return NextResponse.json({ ok: true, missions, state, category, limit, filters });
}