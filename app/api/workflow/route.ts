import { NextResponse } from "next/server";
import { workflowStats, latestVerifications, verificationCounts, allAgentRuns } from "@/lib/db/repo";
import { verifierCacheStats } from "@/lib/mail/verify";
import { PRICING, OFFER_SUMMARY } from "@/agents/types";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

/**
 * Everything the workflow dashboard renders: the funnel, per-stage counts, the
 * email-health breakdown, and the verifier's audit trail — so any number on
 * screen can be traced back to a decision and a reason.
 */
export async function GET() {
  // Honest engine state: derived from what the agents are actually doing right
  // now, so the board never claims to be "live" while every bot sits idle.
  const activeAgents = allAgentRuns().filter((r) => ["working", "thinking", "reviewing"].includes(r.status)).length;

  return NextResponse.json({
    workflow: workflowStats(),
    verifications: latestVerifications(60),
    verificationCounts: verificationCounts(),
    verifierCache: verifierCacheStats(),
    pricing: { ...PRICING, summary: OFFER_SUMMARY },
    autoApprove: config.autoApprove,
    engine: { autonomous: config.autonomous, activeAgents },
  });
}
