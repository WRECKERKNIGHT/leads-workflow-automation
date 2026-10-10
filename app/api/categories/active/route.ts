import { NextRequest, NextResponse } from "next/server";
import { CATEGORY_CONFIG } from "@/agents/types";
import { setActiveCategory, setSetting } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

const validCategories = new Set<string>(CATEGORY_CONFIG.map((c) => c.value));

/**
 * Start (or switch to) ONE category. Exactly one category runs at a time; the
 * autonomous engine reads `category.active` on every mission, so no restart is
 * needed. `launch` starts a discovery mission for it immediately.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const category = String(body.category ?? "").trim();
  if (!validCategories.has(category)) {
    return NextResponse.json({ ok: false, error: `unknown category: ${category}` }, { status: 400 });
  }

  setActiveCategory(category);
  // Clear any stale per-category switch before it can fight the new one.
  setSetting("category.stopped", null);

  let launched = false;
  if (body.launch === true) {
    try {
      const { launchNextMission } = await import("@/lib/autonomous/engine");
      const id = await launchNextMission();
      launched = id !== null && id !== undefined;
    } catch {
      launched = false;
    }
  }

  return NextResponse.json({ ok: true, active: category, launched });
}