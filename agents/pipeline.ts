import type { AgentId, Stage } from "./types";
import { STAGE_TO_AGENT, MAIN_FLOW, STAGE_LABELS, STAGE_ICONS } from "./types";
import {
  getInstitutionsByStage,
  getInstitution,
  setStage,
  pushPipelineEvent,
  pushOfficeEvent,
  getAgentRun,
} from "@/lib/db/repo";
import { getDb } from "@/lib/db";
import { runLeadOrganizer } from "./organizer";
import { runResearchAgent } from "./research";
import { runOpportunityFinder } from "./opportunity";
import { runDemoBuilder } from "./demo";
import { runMessageWriter } from "./message";

export type { Stage };

/** Stages that are waiting on a human — the pipeline must never advance them. */
const BLOCKING: ReadonlySet<string> = new Set(["needs_human", "error", "awaiting_approval"]);

/**
 * Advance one school folder one step through the EduSuite workflow:
 * discovery -> organizer -> research -> opportunity -> demo -> message,
 * then it parks at "awaiting_approval" for a human.
 */
export async function advanceInstitution(id: number): Promise<Stage | null> {
  const inst = getInstitution(id);
  if (!inst) return null;
  const current = inst.stage as Stage;

  if (current === "done") return current;
  if (BLOCKING.has(inst.folder_status)) return current;

  const moveToNext = (from: Stage) => {
    const idx = MAIN_FLOW.indexOf(from);
    const next = MAIN_FLOW[idx + 1];
    if (!next || next === "sent" || next === "reply") {
      setStage(id, "message", "in_progress", "message_writer");
      pushPipelineEvent(id, "folder_moved", {
        fromStage: from,
        toStage: "message",
        agentId: "message_writer",
      });
      return "message";
    }
    setStage(id, next, "in_progress", STAGE_TO_AGENT[next]);
    pushPipelineEvent(id, "folder_moved", {
      fromStage: from,
      toStage: next,
      agentId: STAGE_TO_AGENT[next],
    });
    return next;
  };

  const stopped = () => {
    const after = getInstitution(id);
    return after && BLOCKING.has(after.folder_status);
  };

  switch (current) {
    case "discovery": {
      pushPipelineEvent(id, "folder_moved", {
        fromStage: current,
        toStage: "organizer",
        agentId: "lead_organizer",
      });
      setStage(id, "organizer", "in_progress", "lead_organizer");
      pushOfficeEvent("step", `📁 ${inst.name} moved to Research`, {
        agentId: "lead_organizer",
        icon: "📁",
      });
      return "organizer";
    }
    case "organizer": {
      await runLeadOrganizer(id);
      const afterOrganizer = getInstitution(id);
      if (afterOrganizer?.stage === "done") return "done";
      return stopped() ? current : moveToNext(current);
    }
    case "research": {
      await runResearchAgent(id);
      return stopped() ? current : moveToNext(current);
    }
    case "opportunity": {
      await runOpportunityFinder(id);
      return stopped() ? current : moveToNext(current);
    }
    case "demo": {
      await runDemoBuilder(id);
      return stopped() ? current : moveToNext(current);
    }
    case "message": {
      await runMessageWriter(id);
      const after = getInstitution(id);
      if (after && after.folder_status === "awaiting_approval") {
        pushOfficeEvent("needs", `⚠ ${after.name} message awaits your approval`, {
          agentId: "message_writer",
          icon: "⚠️",
        });
      }
      return "message";
    }
    default:
      return current;
  }
}

/** Advance up to `limit` actionable institutions sitting in `stage` one step. */
export async function advanceStage(stage: Stage, limit = 60): Promise<number> {
  const queue = getInstitutionsByStage(stage, limit);
  let advanced = 0;
  for (const inst of queue) {
    if (BLOCKING.has(inst.folder_status)) continue;
    const agent = STAGE_TO_AGENT[inst.stage as Stage];
    if (agent && (await agentBusy(agent))) continue;
    const next = await advanceInstitution(inst.id as number);
    if (next) advanced++;
  }
  return advanced;
}

/**
 * Drive every queued folder through the pipeline until walls or done.
 * Each stage gets an equal slice per pass so the slow, network-heavy organizer
 * cannot starve downstream stages (research/demo/message). Leftovers drain on
 * the next cycle.
 */
export async function processQueues(perStage = 4): Promise<{ progressed: number }> {
  let progressed = 0;
  const stages = MAIN_FLOW.filter((s) => s !== "sent" && s !== "reply");
  for (let pass = 0; pass < 2; pass++) {
    let made = 0;
    for (const stage of stages) {
      made += await advanceStage(stage, perStage);
    }
    if (made === 0) break;
    progressed += made;
  }
  return { progressed };
}

/**
 * Human unblocks a folder (fills in email/phone, fixes research) and it
 * sprints down the pipeline until it hits the next human boundary.
 */
export async function resumeInstitution(id: number): Promise<Stage | null> {
  const inst = getInstitution(id as number);
  if (!inst) return null;
  const stage = inst.stage as Stage;

  if (stage === "done" || stage === "message") return stage;

  if (BLOCKING.has(inst.folder_status)) {
    setStage(id as number, stage, "in_progress", null);
  }

  let current: Stage = stage;
  for (let i = 0; i < MAIN_FLOW.length + 1; i++) {
    const now = getInstitution(id as number);
    if (!now) break;
    if (now.stage === "message" || now.stage === "done") {
      current = now.stage as Stage;
      break;
    }
    if (BLOCKING.has(now.folder_status)) {
      current = now.stage as Stage;
      break;
    }
    const next = await advanceInstitution(id as number);
    current = next ?? (now.stage as Stage);
  }
  return current;
}

async function agentBusy(agent: AgentId): Promise<boolean> {
  const run = getAgentRun(agent);
  return run?.status === "working";
}

export function countActive(): number {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT COUNT(*) n FROM institutions WHERE stage NOT IN ('done') AND folder_status NOT IN ('error','awaiting_approval','needs_human')"
    )
    .get() as { n: number };
  return row.n;
}

export { STAGE_LABELS, STAGE_ICONS };