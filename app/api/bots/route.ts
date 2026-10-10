import { NextResponse } from "next/server";
import { BOT_PROFILES } from "@/agents/types";
import { allAgentRuns, logsForAgent } from "@/lib/db/repo";

export const dynamic = "force-dynamic";

/** Full bot roster — profile + live run status + recent log tail for each agent. */
export async function GET() {
  const runs = allAgentRuns();
  const byAgent = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!byAgent.has(r.agent_id)) byAgent.set(r.agent_id, r);

  const bots = BOT_PROFILES.map((profile) => ({
    profile,
    run: byAgent.get(profile.id) ?? null,
    logs: logsForAgent(profile.id, 6),
  }));

  return NextResponse.json({ bots });
}