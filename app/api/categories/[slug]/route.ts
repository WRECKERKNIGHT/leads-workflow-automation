import { NextResponse } from "next/server";
import { CATEGORY_CONFIG, categoryFromSlug } from "@/agents/types";
import { categoryStats, institutionsByCategory, latestMissionForCategory, allAgentRuns } from "@/lib/db/repo";
import { resolveActiveCategory } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * Everything a category dashboard renders: category meta, live totals, the
 * per-stage breakdown the wired workflow draws, the recent leads table, and
 * the current agent-run state for the bot profile cards.
 */
export async function GET(_req: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const category = categoryFromSlug(slug);
  if (!category) {
    return NextResponse.json({ error: `unknown category slug: ${slug}` }, { status: 404 });
  }

  const meta = CATEGORY_CONFIG.find((c) => c.value === category)!;
  const stats = categoryStats(category);

  return NextResponse.json({
    category,
    meta: {
      slug,
      glyph: meta.glyph,
      pitch: meta.pitch,
      offer: meta.offer,
      overpassTags: meta.overpassTags,
    },
    active: resolveActiveCategory() === category,
    stats: stats.totals,
    byStage: stats.byStage,
    latestMission: latestMissionForCategory(category),
    leads: institutionsByCategory(category, 300),
    agents: allAgentRuns(),
  });
}