import type { AgentId, AgentStatus } from "@/agents/types";
import { upsertAgentRun, logAgent, pushOfficeEvent } from "@/lib/db/repo";

/**
 * Tiny helper that wraps an agent's lifecycle: working -> done (or error),
 * updates agent_runs, pushes logs + office events.
 */
export async function runAgentTask(params: {
  agentId: AgentId;
  missionId?: number;
  institutionId?: number;
  taskLabel: string;
  fn: (ctx: { task: (msg: string) => void; progress: (p: number, msg?: string) => void }) => Promise<void>;
}): Promise<{ ok: boolean; error?: string }> {
  const { agentId, missionId, institutionId, taskLabel } = params;
  const started = new Date().toISOString();

  // Context object injected into the task
  const ctx: Parameters<typeof params.fn>[0] = {
    task(msg: string) {
      upsertAgentRun(agentId, {
        status: "working",
        current_task: msg,
        last_action: msg,
        mission_id: missionId,
        institution_id: institutionId,
        started_at: started,
      });
    },
    progress(p: number, msg?: string) {
      upsertAgentRun(agentId, {
        status: "working",
        progress: Math.max(0, Math.min(100, p)),
        ...(msg ? { current_task: msg, last_action: msg } : {}),
        mission_id: missionId,
        institution_id: institutionId,
        started_at: started,
      });
    },
  };

  try {
    ctx.task(`Starting: ${taskLabel}`);
    logAgent(agentId, `Starting ${taskLabel}`, { missionId, institutionId });
    await params.fn(ctx);
    upsertAgentRun(agentId, {
      status: "waiting",
      progress: 100,
      current_task: "Idle",
      finished_at: new Date().toISOString(),
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    upsertAgentRun(agentId, { status: "error", last_action: msg, finished_at: new Date().toISOString() });
    logAgent(agentId, `Error: ${msg}`, { level: "error", missionId, institutionId });
    pushOfficeEvent("error", `Agent error: ${msg}`, { agentId, icon: "🔥" });
    return { ok: false, error: msg };
  }
}

export function setAgentWaiting(agentId: AgentId) {
  upsertAgentRun(agentId, { status: "waiting", current_task: "Idle", progress: 0 });
}
