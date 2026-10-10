import { config } from "@/lib/config";
import { getDb, nowIso } from "@/lib/db";
import {
  getInstitution,
  getAgentRun,
  pushOfficeEvent,
  logAgent,
  listInboxThreads,
  updateInstitution,
  quarantineInvalidContacts,
} from "@/lib/db/repo";
import { processQueues } from "@/agents/pipeline";
import { runDiscovery, INDIA_STATES } from "@/agents/discovery";
import { sendOutreachEmail, receiveInboundReply } from "@/agents/sender";
import { runMailSync } from "@/agents/mail";
import { classifyReply } from "@/agents/replies";
import { runVerifierTask } from "@/agents/verifier";
import { resolveActiveCategory } from "@/lib/config";
import type { AgentId } from "@/agents/types";

/**
 * Autonomous engine — keeps WreckerAI running on its own:
 *  1. Drives the EduSuite pipeline (discovery -> ... -> message -> approval).
 *  2. Rotates all-India discovery missions across states/categories.
 *  3. Auto-approves + sends outreach via real SMTP (approval-gated by env).
 *  4. Simulates inbound replies (when enabled) so the reply flow can be seen
 *     end-to-end; classifies real + simulated replies with the LLM.
 */

let started = false;
let pipelineTimer: NodeJS.Timeout | null = null;
let missionTimer: NodeJS.Timeout | null = null;
let mailTimer: NodeJS.Timeout | null = null;
let cycleRunning = false;

const MISSION_LIMIT = config.discoveryPerMission;
let stateCursor = 0;
let missionInFlight = false;
const recentMissions = new Set<number>();

const AGENT_IDS: AgentId[] = [
  "lead_finder", "lead_organizer", "research_agent", "opportunity_finder",
  "demo_builder", "message_writer", "verifier", "email_sender", "reply_manager",
  "mail_monitor",
];

export function startAutonomousEngine() {
  if (started || typeof window !== "undefined") return;
  started = true;

  getDb(); // ensure schema
  ensureAgentsOnline();
  quarantineInvalidContacts();

  logAgent("lead_finder", "WreckerAI Engine ONLINE — all-India self-running agency", {});
  pushOfficeEvent("mission", "🚀 WreckerAI engine ONLINE — lead automation running", { agentId: "lead_finder", icon: "🚀" });

  pipelineTimer = setInterval(() => {
    runPipelineCycle().catch(() => {});
  }, config.pipelineIntervalMs);

  if (config.autonomous) {
    missionTimer = setInterval(() => {
      launchNextMission().catch(() => {});
    }, config.autoMissionIntervalMs);
  }

  // Real inbox monitoring (IMAP) — replies, bounces, errors.
  mailTimer = setInterval(() => {
    runMailSync().catch(() => {});
  }, config.mailPollIntervalMs);
  setTimeout(() => runMailSync().catch(() => {}), 4000);

  runPipelineCycle().catch(() => {});
  if (config.autonomous) {
    launchSoon();
  }
}

function launchSoon() {
  const t = setTimeout(() => launchNextMission().catch(() => {}), 2000);
  t.unref?.();
}

function ensureAgentsOnline() {
  const db = getDb();
  for (const id of AGENT_IDS) {
    const exists = db.prepare("SELECT COUNT(*) n FROM agent_runs WHERE agent_id = ?").get(id) as { n: number };
    if (!exists.n) {
      db.prepare(
        "INSERT INTO agent_runs (agent_id, status, current_task, progress, queue) VALUES (?, 'waiting', 'Idle', 0, 0)"
      ).run(id);
    } else {
      // Fresh boot: no task can actually be running, so clear any stale
      // "working"/"error" state left over from a previous process.
      db.prepare("UPDATE agent_runs SET status = 'waiting', current_task = 'Idle', progress = 0 WHERE agent_id = ?").run(id);
    }
  }
}

export async function runPipelineCycle(): Promise<{ progressed: number; sent: number; replied: number; verified: number; blocked: number }> {
  if (!config.autonomous || cycleRunning) return { progressed: 0, sent: 0, replied: 0, verified: 0, blocked: 0 };
  cycleRunning = true;
  try {
    const progressed = (await processQueues()).progressed;

    // 1) The Verifier judges every freshly drafted message. Passing drafts are
    //    approved automatically; failing ones are rejected with a reason.
    const verdict = config.autoApprove ? await runVerifierTask() : { checked: 0, approved: 0, blocked: 0 };
    if (verdict.checked) await ensureSmptWaitersApproved();

    // 2) Approved drafts go out over SMTP.
    const sent = await autoSendOutreach();

    const replied = config.simulateReplies ? await simulateReplies() : 0;
    await processUnclassifiedReplies();

    return { progressed, sent, replied, verified: verdict.approved, blocked: verdict.blocked };
  } finally {
    cycleRunning = false;
  }
}

/**
 * Send approved drafts. With AUTO_APPROVE on (the default) the whole chain —
 * draft → verify → approve → send — runs with no human click; anything the
 * verifier does not like is stopped and reported instead.
 */
async function autoSendOutreach(): Promise<number> {
  if (!config.autonomous) return 0;
  if (config.outreachRequireApproval && !config.autoApprove) return 0;
  const db = getDb();
  const items = db
    .prepare("SELECT id FROM outreach_queue WHERE status = 'approved' ORDER BY id LIMIT 10")
    .all() as { id: number }[];
  let sent = 0;
  for (const item of items) {
    const r = await sendOutreachEmail(item.id);
    if (r.ok) sent++;
  }
  return sent;
}

/** For items deferred because SMTP wasn't configured — just re-mark as pending_approval when config appears. */
function ensureSmptWaitersApproved() {
  const db = getDb();
  db.prepare("UPDATE outreach_queue SET status = 'pending_approval' WHERE status = 'pending_smtp'").run();
}

/**
 * Simulate a realistic inbound reply for sent leads after REPLY_DELAY_MS,
 * routed through the real Reply Manager so classification runs for real.
 */
async function simulateReplies(): Promise<number> {
  const db = getDb();
  const delayMs = config.replyDelayMs;
  const cutoff = new Date(Date.now() - delayMs).toISOString().replace("T", " ").slice(0, 19);

  const rows = db
    .prepare(
      `SELECT i.id, i.name
       FROM institutions i
       JOIN outreach_queue o ON o.institution_id = i.id AND o.status = 'sent'
       WHERE (o.sent_at IS NOT NULL AND o.sent_at < ?)
         AND NOT EXISTS (SELECT 1 FROM inbox_threads t WHERE t.institution_id = i.id)
       GROUP BY i.id ORDER BY i.id`
    )
    .all(cutoff) as { id: number; name: string }[];

  let replied = 0;
  for (const row of rows) {
    if (getAgentRun("reply_manager")?.status === "working") break;
    const inst = getInstitution(Number(row.id));
    if (!inst) continue;
    const kind = pickReplyKind();
    const body = replyBody(kind, inst.name ?? row.name);
    const fromAddr = inst.admissions_email || inst.email || `admissions@${slug(inst.name ?? "school")}.in`;
    const threadId = await receiveInboundReply(Number(row.id), `Re: EduSuite Pro demo (${inst.name})`, fromAddr, body);
    setTimeout(() => classifyReply(threadId).catch(() => {}), 1500);
    replied++;
    if (replied >= 4) break;
  }
  return replied;
}

async function processUnclassifiedReplies() {
  const threads = listInboxThreads(150).filter((t) => t.classification === null && (t.kind ?? "reply") === "reply");
  for (const t of threads.slice(0, 3)) {
    if (getAgentRun("reply_manager")?.status === "working") break;
    await classifyReply(t.id);
  }
}

function slug(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || "school";
}

function pickReplyKind(): "interested" | "curious" | "not_interested" {
  if (config.mockMode) return "interested";
  const r = Math.random();
  if (r < 0.5) return "interested";
  if (r < 0.8) return "curious";
  return "not_interested";
}

function replyBody(kind: string, name: string): string {
  switch (kind) {
    case "interested":
      return `Hi, thanks for reaching out. ${name} is actually interested — could you share more detail and a time for a quick call? We'd like to understand the pricing options too.`;
    case "curious":
      return `Hello, we received your note. Could you tell us more about how EduSuite Pro works and what the ${"Basic/Standard"} plans cost?`;
    default:
      return `Thank you, but we're not looking for a new system right now. Please take us off your list.`;
  }
}

/**
 * Launch a fresh all-India discovery mission. ONLY the active category runs —
 * the human chose it on the category-selector screen and it is read from the
 * settings table every launch, so switching categories needs no restart.
 */
export async function launchNextMission(): Promise<number | null> {
  if (!config.autonomous || missionInFlight) return null;
  missionInFlight = true;
  try {
    const db = getDb();
    const states = config.autoStates.length ? config.autoStates : INDIA_STATES;
    const state = states[stateCursor % states.length];
    const category = resolveActiveCategory();
    stateCursor++;

    db.prepare("UPDATE missions SET status = 'done', finished_at = ? WHERE status != 'done'").run(nowIso());

    const missionId = await runDiscovery({
      state,
      category,
      limit: MISSION_LIMIT,
    });
    if (missionId) recentMissions.add(missionId);
    return missionId;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logAgent("lead_finder", `Auto-mission failed: ${msg}`, { level: "warn" });
    pushOfficeEvent("error", `Auto-mission failed: ${msg}`, { agentId: "lead_finder", icon: "🔥" });
    return null;
  } finally {
    missionInFlight = false;
  }
}

export function stopAutonomousEngine() {
  if (pipelineTimer) clearInterval(pipelineTimer);
  if (missionTimer) clearInterval(missionTimer);
  pipelineTimer = missionTimer = null;
  started = false;
}