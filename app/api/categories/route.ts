import { NextResponse } from "next/server";
import { CATEGORY_CONFIG, categorySlug } from "@/agents/types";
import { categoryStats, latestMissionForCategory } from "@/lib/db/repo";
import { resolveActiveCategory } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Every category the selector renders: live counts + which one is running. */
export async function GET() {
  const active = resolveActiveCategory();
  return NextResponse.json({
    active,
    autonomous: process.env.AUTONOMOUS_MODE !== "false",
    categories: CATEGORY_CONFIG.map((c) => {
      const stats = categoryStats(c.value);
      return {
        value: c.value,
        slug: categorySlug(c.value),
        glyph: c.glyph,
        pitch: c.pitch,
        offer: c.offer,
        overpassTags: c.overpassTags,
        active: active === c.value,
        stats: stats.totals,
        byStage: stats.byStage,
        latestMission: latestMissionForCategory(c.value),
      };
    }),
  });
}