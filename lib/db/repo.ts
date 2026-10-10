import { getDb, nowIso, runInTransaction } from "./index";
import { isSendableEmail, isForeignLead, siteBelongsToSchool, registrableDomain } from "@/lib/validation";
import { isWhatsAppNumber, waLink } from "@/lib/whatsapp";
import type { Institution, AgentStatus, AgentId, Stage, FolderStatus, ReplyClassification } from "@/agents/types";
import type { SQLInputValue } from "node:sqlite";

type Row = Record<string, SQLInputValue>;

export function rowToObj<T>(row: Row | undefined): T | null {
  if (!row) return null;
  return row as unknown as T;
}

/* ------------------------------- institutions ------------------------------ */

export function getAllInstitutions(limit = 500): Institution[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM institutions ORDER BY id DESC LIMIT ?").all(limit) as Row[];
  return rows as unknown as Institution[];
}

export function getInstitution(id: number): Institution | null {
  const db = getDb();
  return rowToObj<Institution>(db.prepare("SELECT * FROM institutions WHERE id = ?").get(id) as Row | undefined);
}

export function getInstitutionsByStage(stage: Stage, limit = 200): Institution[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM institutions WHERE stage = ? AND folder_status NOT IN ('awaiting_approval','needs_human','error') ORDER BY id LIMIT ?"
    )
    .all(stage, limit) as Row[];
  return rows as unknown as Institution[];
}

/**
 * Sweep the database for contacts we now know to be untrustworthy. Runs at
 * boot, is idempotent, and is what actually cleans up the junk left by the
 * earlier runs: an address is only kept when its domain is provably the
 * school's own, and the school must not be cross-border.
 *
 * A website that cannot be proven to belong to its school is cleared too —
 * keeping it is what allowed unrelated domains to masquerade as school sites.
 */
export function quarantineInvalidContacts() {
  const db = getDb();

  // 1) Institutions holding a contact that now fails the sendability gate →
  //    clear the address so it can never be drafted to again.
  const rows = db
    .prepare(
      `SELECT id, name, website, email, admissions_email, lat, lon, site_verified, stage, state
       FROM institutions WHERE email IS NOT NULL AND email <> ''`
    )
    .all() as {
    id: number;
    name: string;
    website: string | null;
    email: string | null;
    admissions_email: string | null;
    lat: number | null;
    lon: number | null;
    site_verified: number | null;
    stage: string;
    state: string | null;
  }[];

  const badEmail: typeof rows = [];
  const foreign: typeof rows = [];
  for (const r of rows) {
    const siteDomain = r.website ? registrableDomain(r.website) : null;
    const addr = r.admissions_email || r.email || "";
    const ok = isSendableEmail(addr, {
      siteDomain,
      schoolName: r.name,
      fromMailto: false,
      siteVerified: r.site_verified === 1,
    }).ok;
    if (!ok) badEmail.push(r);
    if (isForeignLead(r.lat, r.lon, r.name, r.state)) foreign.push(r);
  }
  const clearedIds = [...new Set([...badEmail, ...foreign].map((b) => b.id))];
  runInTransaction(() => {
    for (const id of clearedIds) {
      db.prepare(
        "UPDATE institutions SET email = '', admissions_email = '', verified_contact = 0, mailbox_status = 'unverified' WHERE id = ?"
      ).run(id);
    }
    for (const r of foreign) {
      db.prepare("UPDATE institutions SET stage = 'done', folder_status = 'ready' WHERE id = ?").run(r.id);
    }
  });

  // 2) Reject every draft whose recipient is missing, unverified or foreign.
  const drafts = db
    .prepare(
      `SELECT o.id AS oid, i.id AS iid, i.name, i.email, i.admissions_email, i.website, i.lat, i.lon, i.site_verified, i.state
       FROM outreach_queue o JOIN institutions i ON i.id = o.institution_id
       WHERE o.status IN ('pending_approval','approved','pending_smtp')`
    )
    .all() as {
    oid: number;
    iid: number;
    name: string;
    email: string | null;
    admissions_email: string | null;
    website: string | null;
    lat: number | null;
    lon: number | null;
    site_verified: number | null;
    state: string | null;
  }[];

  const rejectIds: Array<{ oid: number; reason: string }> = [];
  for (const d of drafts) {
    const siteDomain = d.website ? registrableDomain(d.website) : null;
    const addr = d.admissions_email || d.email || "";
    if (!addr) {
      rejectIds.push({ oid: d.oid, reason: "no recipient email" });
      continue;
    }
    const gate = isSendableEmail(addr, {
      siteDomain,
      schoolName: d.name,
      fromMailto: false,
      siteVerified: d.site_verified === 1,
    });
    if (!gate.ok) {
      rejectIds.push({ oid: d.oid, reason: `recipient rejected — ${gate.reason}` });
    } else if (isForeignLead(d.lat, d.lon, d.name, d.state)) {
      rejectIds.push({ oid: d.oid, reason: "cross-border school" });
    }
  }
  if (rejectIds.length) {
    runInTransaction(() => {
      for (const r of rejectIds) {
        db.prepare("UPDATE outreach_queue SET status = 'rejected', decisions = ? WHERE id = ?").run(r.reason, r.oid);
      }
    });
  }

  // 3) Clear websites that cannot be proven to belong to their school. This is
  //    the upstream cause of the junk addresses, so it gets fixed at the source.
  const unproven = db
    .prepare(
      `SELECT id, name, website FROM institutions
       WHERE website IS NOT NULL AND website <> '' AND site_verified = 0
         AND stage NOT IN ('done')`
    )
    .all() as { id: number; name: string; website: string }[];
  const badSites = unproven.filter((r) => !siteBelongsToSchool(r.website, r.name).owned);
  if (badSites.length) {
    runInTransaction(() => {
      for (const r of badSites) {
        db.prepare(
          "UPDATE institutions SET website = NULL, site_match_reason = ? WHERE id = ?"
        ).run(`cleared at boot — not provable as this school's site`, r.id);
      }
    });
  }

  if (clearedIds.length || rejectIds.length || badSites.length) {
    if (badEmail.length) {
      pushOfficeEvent("warning", `🚫 Cleared ${badEmail.length} unprovable contact(s): ${badEmail.map((b) => b.name).slice(0, 10).join(", ")}`, {
        agentId: "lead_organizer",
        icon: "🚫",
      });
    }
    if (badSites.length) {
      pushOfficeEvent("warning", `🌐 Cleared ${badSites.length} website(s) that did not belong to their school`, {
        agentId: "lead_organizer",
        icon: "🌐",
      });
    }
    if (foreign.length) {
      pushOfficeEvent("warning", `🌏 Quarantined ${foreign.length} cross-border school(s): ${foreign.map((b) => b.name).slice(0, 10).join(", ")}`, {
        agentId: "lead_finder",
        icon: "🌏",
      });
    }
    if (rejectIds.length) {
      pushOfficeEvent("step", `🗑 Rejected ${rejectIds.length} draft(s) to invalid/foreign recipients`, { agentId: "email_sender", icon: "🗑" });
    }
    logAgent(
      "lead_organizer",
      `Boot quarantine: ${badEmail.length} contacts cleared, ${badSites.length} wrong websites cleared, ${foreign.length} cross-border skipped, ${rejectIds.length} drafts rejected`,
      { level: "warn" }
    );
  }
}

export function countInstitutionsByStage() {
  const db = getDb();
  return db.prepare("SELECT stage, COUNT(*) as n FROM institutions GROUP BY stage").all() as {
    stage: string;
    n: number;
  }[];
}

export function updateInstitution(id: number, fields: Record<string, SQLInputValue>) {
  const db = getDb();
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values: SQLInputValue[] = keys.map((k) => normalize(fields[k]));
  values.push(nowIso(), id);
  db.prepare(
    `UPDATE institutions SET ${setClause}, updated_at = ? WHERE id = ?`
  ).run(...values);
}

export function setStage(id: number, stage: Stage, folderStatus: FolderStatus, agent: AgentId | null, error: string | null = null) {
  updateInstitution(id, {
    stage,
    folder_status: folderStatus,
    last_agent: agent,
    error,
    ...(stage === "done" ? { finished_at: nowIso() } : {}),
  });
}

export function createInstitution(data: Record<string, SQLInputValue>): number {
  const db = getDb();
  const keys = Object.keys(data);
  const cols = keys.join(", ");
  const placeholders = keys.map(() => "?").join(", ");
  const result = db
    .prepare(`INSERT INTO institutions (${cols}) VALUES (${placeholders})`)
    .run(...keys.map((k) => normalize(data[k])));
  return Number(result.lastInsertRowid);
}

/** Dedupe: an institution with the same name + state already on file. */
export function institutionExists(name: string, state?: string | null): boolean {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) n FROM institutions WHERE name = ?${state ? " AND state = ?" : ""}`)
    .get(name, ...(state ? [state] : [])) as { n: number };
  return row.n > 0;
}

function normalize(v: SQLInputValue): SQLInputValue {
  return v === undefined ? null : v;
}

/* --------------------------------- missions -------------------------------- */

export interface Mission {
  id: number;
  region: string;
  category: string;
  limit_n: number;
  filters: string | null;
  status: string;
  created_at: string;
  finished_at: string | null;
}

export function createMission(region: string, category: string, limitN: number, filters?: Record<string, unknown> | null): Mission {
  const db = getDb();
  const result = db
    .prepare("INSERT INTO missions (region, category, limit_n, filters) VALUES (?, ?, ?, ?)")
    .run(region, category, limitN, filters ? JSON.stringify(filters) : null);
  return getMission(Number(result.lastInsertRowid))!;
}

export function getMission(id: number): Mission | null {
  const db = getDb();
  return rowToObj<Mission>(db.prepare("SELECT * FROM missions WHERE id = ?").get(id) as Row | undefined);
}

export function listMissions() {
  const db = getDb();
  return db.prepare("SELECT * FROM missions ORDER BY id DESC").all() as unknown as Mission[];
}

export function finishMission(id: number) {
  const db = getDb();
  db.prepare("UPDATE missions SET status = 'done', finished_at = ? WHERE id = ?").run(nowIso(), id);
}

/* -------------------------------- agent runs ------------------------------- */

export interface AgentRun {
  id: number;
  agent_id: string;
  status: AgentStatus;
  current_task: string | null;
  progress: number;
  queue: number;
  last_action: string | null;
  started_at: string | null;
  finished_at: string | null;
  mission_id: number | null;
  institution_id: number | null;
  error?: string | null;
}

/** Behavior overrides saved at runtime (SMTP creds, profile, etc.). */
export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string | null) {
  const db = getDb();
  if (value === null || value === "") {
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  } else {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }
}

/* ------------------------------ active category ----------------------------- */
/**
 * Only ONE category runs at a time — a deliberate product decision. The human
 * picks the category to start on the category-selector screen; the autonomous
 * engine reads this setting on every mission and ignores everything else.
 */
export function getActiveCategory(): string | null {
  return getSetting("category.active");
}

export function setActiveCategory(category: string) {
  setSetting("category.active", category);
}

export function latestMissionForCategory(category: string) {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM missions WHERE category = ? ORDER BY id DESC LIMIT 1")
    .get(category) as { id: number; region: string; limit_n: number; status: string; created_at: string; finished_at: string | null } | undefined;
  return row ?? null;
}

export function getAllSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export function getAgentRun(agentId: AgentId): AgentRun | null {
  const db = getDb();
  return rowToObj<AgentRun>(db.prepare("SELECT * FROM agent_runs WHERE agent_id = ? ORDER BY id DESC LIMIT 1").get(agentId) as Row | undefined);
}

export function upsertAgentRun(
  agentId: AgentId,
  fields: { status?: AgentStatus; current_task?: string; progress?: number; queue?: number; last_action?: string; started_at?: string; finished_at?: string; mission_id?: number; institution_id?: number; error?: string | null }
) {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM agent_runs WHERE agent_id = ? ORDER BY id DESC LIMIT 1").get(agentId) as { id: number } | undefined;
  const merged = { ...fields } as Record<string, SQLInputValue>;
  if (existing) {
    const keys = Object.keys(merged);
    if (keys.length) {
      const setClause = keys.map((k) => `${k} = ?`).join(", ");
      db.prepare(`UPDATE agent_runs SET ${setClause} WHERE id = ?`).run(
        ...keys.map((k) => normalize(merged[k])),
        existing.id
      );
    }
  } else {
    db.prepare(
      "INSERT INTO agent_runs (agent_id, status, current_task, progress, queue, last_action, started_at, mission_id, institution_id, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      agentId,
      merged.status ?? "waiting",
      merged.current_task ?? null,
      merged.progress ?? 0,
      merged.queue ?? 0,
      merged.last_action ?? null,
      merged.started_at ?? null,
      merged.mission_id ?? null,
      merged.institution_id ?? null,
      merged.error ?? null
    );
  }
}

export function allAgentRuns(): AgentRun[] {
  const db = getDb();
  return db.prepare("SELECT * FROM agent_runs").all() as unknown as AgentRun[];
}

/* -------------------------------- agent logs ------------------------------- */

export function logAgent(
  agentId: AgentId,
  message: string,
  opts: { level?: "info" | "warn" | "error"; missionId?: number; institutionId?: number } = {}
) {
  const db = getDb();
  db.prepare(
    "INSERT INTO agent_logs (agent_id, mission_id, institution_id, level, message) VALUES (?, ?, ?, ?, ?)"
  ).run(agentId, opts.missionId ?? null, opts.institutionId ?? null, opts.level ?? "info", message);
}

export function recentLogs(limit = 80) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM agent_logs ORDER BY id DESC LIMIT ?")
    .all(limit)
    .reverse();
}

export function logsForAgent(agentId: AgentId, limit = 100) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM agent_logs WHERE agent_id = ? ORDER BY id DESC LIMIT ?")
    .all(agentId, limit)
    .reverse();
}

/* ------------------------------ agent outputs ------------------------------ */

export function saveAgentOutput(agentId: AgentId, institutionId: number, data: unknown) {
  const db = getDb();
  db.prepare("INSERT INTO agent_outputs (agent_id, institution_id, data_json) VALUES (?, ?, ?)").run(
    agentId,
    institutionId,
    JSON.stringify(data)
  );
}

export function outputsForInstitution(institutionId: number) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM agent_outputs WHERE institution_id = ? ORDER BY id")
    .all(institutionId);
}

/* ------------------------------ outreach queue ----------------------------- */
export interface OutreachItem {
  id: number;
  institution_id: number;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  follow_up_num: number;
  created_at: string;
  sent_at: string | null;
  /** Verifier agent's summary line for this draft. */
  verdict?: string | null;
  verified_at?: string | null;
  attempts?: number | null;
  decisions?: string | null;
  sent_message_id?: string | null;
  institution_name?: string | null;
}

export function getOutreachItem(id: number): OutreachItem | null {
  const db = getDb();
  return rowToObj<OutreachItem>(db.prepare("SELECT * FROM outreach_queue WHERE id = ?").get(id) as Row | undefined);
}

export function markSent(id: number, note = "") {
  const db = getDb();
  db.prepare("UPDATE outreach_queue SET status = 'sent', sent_at = ?, decisions = ? WHERE id = ?").run(
    nowIso(),
    note,
    id
  );
}

export function addToOutreachQueue(institutionId: number, channel: string, subject: string | null, body: string) {
  const db = getDb();
  const result = db
    .prepare("INSERT INTO outreach_queue (institution_id, channel, subject, body) VALUES (?, ?, ?, ?)")
    .run(institutionId, channel, subject, body);
  return Number(result.lastInsertRowid);
}

/** All outreach items joined with institution names for the approval queue. */
export function outreachAll(limit = 80) {
  const db = getDb();
  return db
    .prepare(
      `SELECT o.*, i.name AS institution_name, i.stage
       FROM outreach_queue o
       LEFT JOIN institutions i ON i.id = o.institution_id
       ORDER BY o.id DESC LIMIT ?`
    )
    .all(limit) as unknown as OutreachItem[];
}

export function outreachPending() {
  const db = getDb();
  return db
    .prepare("SELECT * FROM outreach_queue WHERE status = 'pending_approval' ORDER BY id")
    .all() as unknown as OutreachItem[];
}

export function outreachForInstitution(institutionId: number) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM outreach_queue WHERE institution_id = ? ORDER BY id DESC")
    .all(institutionId) as unknown as OutreachItem[];
}

export function updateOutreach(id: number, fields: Record<string, SQLInputValue>) {
  const db = getDb();
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  db.prepare(`UPDATE outreach_queue SET ${setClause} WHERE id = ?`).run(...keys.map((k) => normalize(fields[k])), id);
}

/* ----------------------------- pipeline events ----------------------------- */

export function pushPipelineEvent(
  institutionId: number,
  event: string,
  opts: { fromStage?: Stage | null; toStage?: Stage | null; agentId?: AgentId | null } = {}
) {
  const db = getDb();
  db.prepare(
    "INSERT INTO pipeline_events (institution_id, from_stage, to_stage, event, agent_id) VALUES (?, ?, ?, ?, ?)"
  ).run(
    institutionId,
    opts.fromStage ?? null,
    opts.toStage ?? null,
    event,
    opts.agentId ?? null
  );
}

export function recentPipelineEvents(limit = 200) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM pipeline_events ORDER BY id DESC LIMIT ?")
    .all(limit)
    .reverse();
}

export function pipelineEventsSince(id: number) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM pipeline_events WHERE id > ? ORDER BY id")
    .all(id) as {
    id: number;
    institution_id: number;
    from_stage: string | null;
    to_stage: string | null;
    event: string;
    agent_id: string | null;
    created_at: string;
  }[];
}

/* --------------------------- email verifications --------------------------- */

export interface VerificationRecord {
  id: number;
  institution_id: number;
  outreach_id: number | null;
  email: string;
  domain: string | null;
  status: string;
  checks_json: string | null;
  reason: string | null;
  auto_approved: number;
  created_at: string;
  institution_name?: string | null;
}

/** Record (or refresh) the verification verdict for one address. */
export function saveVerification(rec: {
  institutionId: number;
  outreachId?: number | null;
  email: string;
  status: string;
  checks?: unknown;
  reason?: string | null;
  autoApproved?: boolean;
}): void {
  const db = getDb();
  const domain = rec.email.split("@")[1] ?? null;
  const checks = rec.checks ? JSON.stringify(rec.checks) : null;
  db.prepare(
    `INSERT INTO email_verifications (institution_id, outreach_id, email, domain, status, checks_json, reason, auto_approved)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET
       institution_id = excluded.institution_id,
       outreach_id = excluded.outreach_id,
       domain = excluded.domain,
       status = excluded.status,
       checks_json = excluded.checks_json,
       reason = excluded.reason,
       auto_approved = excluded.auto_approved,
       created_at = datetime('now')`
  ).run(
    rec.institutionId,
    rec.outreachId ?? null,
    rec.email,
    domain,
    rec.status,
    checks,
    rec.reason ?? null,
    rec.autoApproved ? 1 : 0
  );
}

export function latestVerifications(limit = 60): VerificationRecord[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT v.*, i.name AS institution_name
       FROM email_verifications v
       LEFT JOIN institutions i ON i.id = v.institution_id
       ORDER BY v.created_at DESC, v.id DESC LIMIT ?`
    )
    .all(limit) as unknown as VerificationRecord[];
}

export function verificationFor(email: string): VerificationRecord | null {
  const db = getDb();
  return rowToObj<VerificationRecord>(
    db.prepare("SELECT * FROM email_verifications WHERE email = ?").get(email.toLowerCase()) as Row | undefined
  );
}

export function verificationCounts() {
  const db = getDb();
  const rows = db.prepare("SELECT status, COUNT(*) n FROM email_verifications GROUP BY status").all() as {
    status: string;
    n: number;
  }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = r.n;
  return out;
}

/* ------------------------------ office events ------------------------------ */
export function pushOfficeEvent(
  kind: string,
  title: string,
  opts: { agentId?: AgentId | null; icon?: string; data?: unknown } = {}
) {
  const db = getDb();
  db.prepare(
    "INSERT INTO office_events (agent_id, kind, title, icon, data_json) VALUES (?, ?, ?, ?, ?)"
  ).run(opts.agentId ?? null, kind, title, opts.icon ?? null, opts.data ? JSON.stringify(opts.data) : null);
}

export function recentOfficeEvents(limit = 80) {
  const db = getDb();
  return db.prepare("SELECT * FROM office_events ORDER BY id DESC LIMIT ?").all(limit).reverse();
}

export function officeEventsSince(id: number) {
  const db = getDb();
  return db
    .prepare("SELECT * FROM office_events WHERE id > ? ORDER BY id")
    .all(id) as {
    id: number;
    agent_id: string | null;
    kind: string;
    title: string;
    icon: string | null;
    data_json: string | null;
    read: number;
    created_at: string;
  }[];
}

/* ---------------------------- inbox / replies ------------------------------ */

export function createInboxThread(
  institutionId: number,
  subject: string,
  fromAddr: string,
  body: string,
  classification: ReplyClassification | null = null,
  kind: string = "reply",
  msgId: string | null = null
) {
  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO inbox_threads (institution_id, subject, from_addr, last_body, classification, status, kind, msg_id, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .run(institutionId, subject, fromAddr, body, classification, kind === "reply" && classification ? "classified" : "new", kind, msgId, nowIso());
  return Number(result.lastInsertRowid);
}

export function findThreadByMsgId(msgId: string): number | null {
  const db = getDb();
  const row = db.prepare("SELECT id FROM inbox_threads WHERE msg_id = ? LIMIT 1").get(msgId) as { id: number } | undefined;
  return row?.id ?? null;
}

export function findInstitutionByEmail(email: string): { id: number; name: string } | null {
  const db = getDb();
  const row = db
    .prepare("SELECT id, name FROM institutions WHERE LOWER(email) = LOWER(?) OR LOWER(admissions_email) = LOWER(?) LIMIT 1")
    .get(email, email) as { id: number; name: string } | undefined;
  return row ?? null;
}

export function institutionIdForSentMessageId(msgId: string): number | null {
  const db = getDb();
  const row = db.prepare("SELECT institution_id FROM outreach_queue WHERE sent_message_id = ? LIMIT 1").get(msgId) as { institution_id: number } | undefined;
  return row?.institution_id ?? null;
}

export function listInboxThreads(limit = 80) {
  const db = getDb();
  return db
    .prepare(
      `SELECT t.*, i.name AS institution_name
       FROM inbox_threads t
       LEFT JOIN institutions i ON i.id = t.institution_id
       ORDER BY t.id DESC LIMIT ?`
    )
    .all(limit) as unknown as {
    id: number;
    institution_id: number;
    subject: string | null;
    from_addr: string | null;
    last_body: string | null;
    classification: string | null;
    status: string | null;
    kind: string;
    msg_id: string | null;
    synced_at: string | null;
    created_at: string;
    institution_name: string | null;
  }[];
}

export function countClassification(col: string) {
  const db = getDb();
  return (
    db.prepare(`SELECT COUNT(*) n FROM inbox_threads WHERE classification = ?`).get(col) as { n: number }
  ).n;
}

export function replyCounts() {
  return {
    replies: countClassification("interested") + countClassification("curious") + countClassification("not_interested") + countClassification("wrong_contact") + countClassification("unclear"),
    interested: countClassification("interested"),
    curious: countClassification("curious"),
    notInterested: countClassification("not_interested"),
    wrongContact: countClassification("wrong_contact"),
    unclear: countClassification("unclear"),
  };
}

export function markThreadClassified(id: number, classification: string) {
  const db = getDb();
  db.prepare("UPDATE inbox_threads SET classification = ?, status = 'classified' WHERE id = ?").run(classification, id);
}

/* ------------------------------- demos ------------------------------------ */

export function createDemo(
  institutionId: number,
  data: { plan_tier: string; title: string; body: string; services: unknown; status?: string }
): number {
  const db = getDb();
  const result = db
    .prepare("INSERT INTO demos (institution_id, plan_tier, title, body, services, status) VALUES (?, ?, ?, ?, ?, ?)")
    .run(
      institutionId,
      normalize(data.plan_tier),
      normalize(data.title),
      normalize(data.body),
      normalize(typeof data.services === "string" ? data.services : JSON.stringify(data.services)),
      data.status ?? "pending"
    );
  return Number(result.lastInsertRowid);
}

export function listDemos(limit = 80) {
  const db = getDb();
  return db
    .prepare(
      `SELECT d.*, i.name AS institution_name, i.stage
       FROM demos d
       LEFT JOIN institutions i ON i.id = d.institution_id
       ORDER BY d.id DESC LIMIT ?`
    )
    .all(limit) as unknown as {
    id: number;
    institution_id: number;
    plan_tier: string | null;
    title: string | null;
    body: string;
    services: string | null;
    status: string;
    created_at: string;
    institution_name: string | null;
  }[];
}

export function updateDemo(id: number, fields: Record<string, SQLInputValue>) {
  const db = getDb();
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  db.prepare(`UPDATE demos SET ${setClause} WHERE id = ?`).run(...keys.map((k) => normalize(fields[k])), id);
}

/* ------------------------------ appointments ---------------------------- */

export function listAppointments(limit = 60) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT a.*, i.name AS institution_name
       FROM appointments a
       LEFT JOIN institutions i ON i.id = a.institution_id
       ORDER BY a.id DESC LIMIT ?`
    )
    .all(limit) as unknown as { id: number; institution_name: string | null }[];
  return rows.map((r) => rowToObj(r));
}

export function createAppointment(
  institutionId: number,
  type: string,
  scheduledFor: string,
  notes: string | null,
  status = "pending"
): number {
  const db = getDb();
  const result = db
    .prepare("INSERT INTO appointments (institution_id, type, scheduled_for, status, notes) VALUES (?, ?, ?, ?, ?)")
    .run(institutionId, type, scheduledFor, status, notes);
  return Number(result.lastInsertRowid);
}

/* ------------------------------ dashboard stats ----------------------------- */

/**
 * Every number the dashboard shows, in one place, so the workflow is fully
 * transparent: how many leads entered, how many survived contact discovery,
 * how many drafts were verified, and exactly why anything was stopped.
 */
export interface WorkflowStage {
  key: string;
  label: string;
  count: number;
  /** Of the count, how many are currently sitting here. */
  sitting: number;
  blocked: number;
  note: string;
}

export interface WorkflowStats {
  stages: WorkflowStage[];
  totals: {
    discovered: number;
    withRealEmail: number;
    siteVerified: number;
    draftsWritten: number;
    verifiedOk: number;
    verifiedBlocked: number;
    sent: number;
    bounced: number;
    awaitingApproval: number;
    rejected: number;
    replied: number;
    interested: number;
  };
  emailHealth: {
    mailbox: Record<string, number>;
    sources: Record<string, number>;
    domains: { domain: string; count: number }[];
  };
  funnel: { label: string; value: number }[];
}

export function workflowStats(): WorkflowStats {
  const db = getDb();
  const c = (sql: string, ...a: SQLInputValue[]) => (db.prepare(sql).get(...a) as { n: number }).n;

  const discovered = c("SELECT COUNT(*) n FROM institutions");
  const withRealEmail = c("SELECT COUNT(*) n FROM institutions WHERE email IS NOT NULL AND email <> ''");
  const siteVerified = c("SELECT COUNT(*) n FROM institutions WHERE site_verified = 1");
  const draftsWritten = c("SELECT COUNT(*) n FROM outreach_queue");
  const verifiedOk = c("SELECT COUNT(*) n FROM email_verifications WHERE status = 'verified'");
  const verifiedBlocked = c("SELECT COUNT(*) n FROM email_verifications WHERE status = 'rejected'");
  const sent = c("SELECT COUNT(*) n FROM outreach_queue WHERE status = 'sent'");
  const bounced = c("SELECT COUNT(*) n FROM institutions WHERE bounced = 1");
  const awaitingApproval = c("SELECT COUNT(*) n FROM outreach_queue WHERE status = 'pending_approval'");
  const rejected = c("SELECT COUNT(*) n FROM outreach_queue WHERE status = 'rejected'");
  const replied = c("SELECT COUNT(*) n FROM inbox_threads WHERE kind = 'reply'");
  const interested = c("SELECT COUNT(*) n FROM inbox_threads WHERE classification = 'interested'");

  const byStage = (stage: string) => c("SELECT COUNT(*) n FROM institutions WHERE stage = ?", stage);

  const stages: WorkflowStage[] = [
    { key: "discovery", label: "Discovered", count: discovered, sitting: byStage("discovery"), blocked: 0, note: "Found via OpenStreetMap across all-India sweeps" },
    { key: "organizer", label: "Contacts found", count: withRealEmail, sitting: byStage("organizer"), blocked: 0, note: "Real address found on a site proven to be the school's" },
    { key: "research", label: "Researched", count: byStage("research") + byStage("opportunity"), sitting: byStage("research"), blocked: 0, note: "Website, app and admission-form audit" },
    { key: "opportunity", label: "Opportunity scored", count: c("SELECT COUNT(*) n FROM institutions WHERE opportunity_priority IS NOT NULL"), sitting: byStage("opportunity"), blocked: 0, note: "Priority and pitch angle chosen" },
    { key: "demo", label: "Demo built", count: c("SELECT COUNT(*) n FROM demos"), sitting: byStage("demo"), blocked: 0, note: "Personalized facts sheet with the correct pricing" },
    { key: "message", label: "Email drafted", count: draftsWritten, sitting: byStage("message"), blocked: 0, note: "Personalized message written by the message writer" },
    { key: "verifier", label: "Verified", count: verifiedOk, sitting: awaitingApproval, blocked: verifiedBlocked, note: "Address + mailbox + pricing checked before send" },
    { key: "sent", label: "Sent", count: sent, sitting: byStage("sent"), blocked: bounced, note: "Delivered through Gmail SMTP" },
    { key: "reply", label: "Replied", count: replied, sitting: byStage("reply"), blocked: 0, note: `${interested} marked interested` },
  ];

  const mailboxRows = db
    .prepare("SELECT COALESCE(mailbox_status,'unverified') s, COUNT(*) n FROM institutions WHERE email <> '' GROUP BY s")
    .all() as { s: string; n: number }[];
  const mailbox: Record<string, number> = {};
  for (const r of mailboxRows) mailbox[r.s] = r.n;

  const sourceRows = db
    .prepare("SELECT COALESCE(contact_source,'unknown') s, COUNT(*) n FROM institutions WHERE email <> '' GROUP BY s")
    .all() as { s: string; n: number }[];
  const sources: Record<string, number> = {};
  for (const r of sourceRows) sources[r.s] = r.n;

  const domains = db
    .prepare(
      `SELECT LOWER(substr(email, instr(email,'@')+1)) AS domain, COUNT(*) AS count
       FROM institutions WHERE email <> ''
       GROUP BY domain ORDER BY count DESC LIMIT 12`
    )
    .all() as { domain: string; count: number }[];

  return {
    stages,
    totals: {
      discovered,
      withRealEmail,
      siteVerified,
      draftsWritten,
      verifiedOk,
      verifiedBlocked,
      sent,
      bounced,
      awaitingApproval,
      rejected,
      replied,
      interested,
    },
    emailHealth: { mailbox, sources, domains },
    funnel: [
      { label: "Discovered", value: discovered },
      { label: "Real email", value: withRealEmail },
      { label: "Site proven", value: siteVerified },
      { label: "Drafted", value: draftsWritten },
      { label: "Verified", value: verifiedOk },
      { label: "Sent", value: sent },
      { label: "Replied", value: replied },
    ],
  };
}

export interface DashboardStats {
  agentsOnline: number;
  agentsWorking: number;
  agentsThinking: number;
  agentsWaiting: number;
  agentsError: number;
  agentsReviewing: number;
  agentsNeedsHuman: number;
  totalLeads: number;
  leadsToday: number;
  sent: number;
  pendingApproval: number;
  demos: number;
  byStage: Record<string, number>;
  byCategory: Record<string, number>;
  replies: ReturnType<typeof replyCounts>;
  noWebsite: number;
  noApp: number;
  mobilePoor: number;
  highPriorityOpportunities: number;
}

export function dashboardStats(): DashboardStats {
  const db = getDb();
  const runs = allAgentRuns() as { status: AgentStatus }[];
  const totalLeads = (db.prepare("SELECT COUNT(*) n FROM institutions").get() as { n: number }).n;
  const leadsToday = (
    db.prepare(`SELECT COUNT(*) n FROM institutions WHERE date(created_at) = date('now')`).get() as { n: number }
  ).n;
  const sent = (
    db.prepare(`SELECT COUNT(*) n FROM outreach_queue WHERE status = 'sent'`).get() as { n: number }
  ).n;
  const pendingApproval = (
    db.prepare(`SELECT COUNT(*) n FROM outreach_queue WHERE status = 'pending_approval'`).get() as { n: number }
  ).n;
  const demos = (db.prepare("SELECT COUNT(*) n FROM demos").get() as { n: number }).n;

  const noWebsite = (
    db.prepare(`SELECT COUNT(*) n FROM institutions WHERE (website IS NULL OR website = '')`).get() as { n: number }
  ).n;
  const noApp = (
    db.prepare(`SELECT COUNT(*) n FROM institutions WHERE app_status IN ('app_not_found')`).get() as { n: number }
  ).n;
  const mobilePoor = (
    db.prepare(`SELECT COUNT(*) n FROM institutions WHERE website_up = 1 AND mobile_friendly = 0`).get() as { n: number }
  ).n;
  const highPriorityOpportunities = (
    db.prepare(`SELECT COUNT(*) n FROM institutions WHERE opportunity_priority = 'High'`).get() as { n: number }
  ).n;

  const byStageRaw = countInstitutionsByStage();
  const byStage: Record<string, number> = {};
  for (const s of byStageRaw) byStage[s.stage] = s.n;

  const byCategoryRaw = db.prepare("SELECT category, COUNT(*) as n FROM institutions GROUP BY category").all() as {
    category: string;
    n: number;
  }[];
  const byCategory: Record<string, number> = {};
  for (const c of byCategoryRaw) byCategory[c.category] = c.n;

  const agentsOnline = runs.length;
  const agentsWorking = runs.filter((r) => r.status === "working").length;
  const agentsThinking = runs.filter((r) => r.status === "thinking").length;
  const agentsWaiting = runs.filter((r) => r.status === "waiting").length;
  const agentsError = runs.filter((r) => r.status === "error").length;
  const agentsReviewing = runs.filter((r) => r.status === "reviewing").length;
  const agentsNeedsHuman = runs.filter((r) => r.status === "needs_human").length;

  return {
    agentsOnline,
    agentsWorking,
    agentsThinking,
    agentsWaiting,
    agentsError,
    agentsReviewing,
    agentsNeedsHuman,
    totalLeads,
    leadsToday,
    sent,
    pendingApproval,
    demos,
    byStage,
    byCategory,
    replies: replyCounts(),
    noWebsite,
    noApp,
    mobilePoor,
    highPriorityOpportunities,
  };
}

/* ---------------------------- category dashboard ---------------------------- */

export interface CategoryStats {
  category: string;
  active: boolean;
  totals: {
    total: number;
    today: number;
    withPhone: number;
    withWhatsApp: number;
    withEmail: number;
    withWebsite: number;
    sent: number;
    pendingApproval: number;
    replied: number;
    interested: number;
    done: number;
    bounced: number;
    verifiedOk: number;
    highPriority: number;
  };
  byStage: Record<string, number>;
}

/** Everything the category dashboard renders for one category. */
export function categoryStats(category: string): CategoryStats {
  const db = getDb();
  const c = (sql: string) => (db.prepare(sql).get(category) as { n: number }).n;
  const active = getActiveCategory() === category;

  const byStage: Record<string, number> = {};
  for (const r of db
    .prepare("SELECT stage, COUNT(*) n FROM institutions WHERE category = ? GROUP BY stage")
    .all(category) as { stage: string; n: number }[]) {
    byStage[r.stage] = r.n;
  }

  return {
    category,
    active,
    totals: {
      total: c("SELECT COUNT(*) n FROM institutions WHERE category = ?"),
      today: c("SELECT COUNT(*) n FROM institutions WHERE category = ? AND date(created_at) = date('now')"),
      withPhone: c("SELECT COUNT(*) n FROM institutions WHERE category = ? AND phone IS NOT NULL AND phone <> ''"),
      withWhatsApp: c("SELECT COUNT(*) n FROM institutions WHERE category = ? AND whatsapp_available = 1"),
      withEmail: c(
        "SELECT COUNT(*) n FROM institutions WHERE category = ? AND ((email IS NOT NULL AND email <> '') OR (admissions_email IS NOT NULL AND admissions_email <> ''))"
      ),
      withWebsite: c("SELECT COUNT(*) n FROM institutions WHERE category = ? AND website IS NOT NULL AND website <> ''"),
      sent: c(
        "SELECT COUNT(*) n FROM outreach_queue o JOIN institutions i ON i.id = o.institution_id WHERE i.category = ? AND o.status = 'sent'"
      ),
      pendingApproval: c(
        "SELECT COUNT(*) n FROM outreach_queue o JOIN institutions i ON i.id = o.institution_id WHERE i.category = ? AND o.status = 'pending_approval'"
      ),
      replied: c(
        "SELECT COUNT(*) n FROM inbox_threads t JOIN institutions i ON i.id = t.institution_id WHERE i.category = ? AND t.kind = 'reply'"
      ),
      interested: c(
        "SELECT COUNT(*) n FROM inbox_threads t JOIN institutions i ON i.id = t.institution_id WHERE i.category = ? AND t.classification = 'interested'"
      ),
      done: c("SELECT COUNT(*) n FROM institutions WHERE category = ? AND stage = 'done'"),
      bounced: c("SELECT COUNT(*) n FROM institutions WHERE category = ? AND bounced = 1"),
      verifiedOk: c(
        "SELECT COUNT(*) n FROM email_verifications v JOIN institutions i ON i.id = v.institution_id WHERE i.category = ? AND v.status = 'verified'"
      ),
      highPriority: c("SELECT COUNT(*) n FROM institutions WHERE category = ? AND opportunity_priority = 'High'"),
    },
    byStage,
  };
}

export function institutionsByCategory(category: string, limit = 300): Institution[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM institutions WHERE category = ? ORDER BY id DESC LIMIT ?")
    .all(category, limit) as unknown as Institution[];
}

/** Approved outreach items for a category (for the export: last sent touch). */
export function outreachForCategory(category: string, limit = 300) {
  const db = getDb();
  return db
    .prepare(
      `SELECT o.institution_id, o.channel, o.status, o.sent_at, o.follow_up_num
       FROM outreach_queue o JOIN institutions i ON i.id = o.institution_id
       WHERE i.category = ? AND o.status NOT IN ('rejected') ORDER BY o.id DESC LIMIT ?`
    )
    .all(category, limit) as unknown as {
    institution_id: number;
    channel: string;
    status: string;
    sent_at: string | null;
    follow_up_num: number;
  }[];
}

/**
 * Every piece of information about a lead, flattened for export. This is the
 * whole point of the export: everything a human needs to manually approach the
 * lead — name, number, location, category, plus the richer outreach fields.
 */
export function exportRowsForCategory(category: string, limit = 5000): Record<string, unknown>[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM institutions WHERE category = ? ORDER BY id DESC LIMIT ?")
    .all(category, limit) as Row[];
  const sent = new Map<number, { status: string; channel: string; sent_at: string | null }>();
  for (const o of outreachForCategory(category)) {
    if (!sent.has(o.institution_id)) {
      sent.set(o.institution_id, { status: o.status, channel: o.channel, sent_at: o.sent_at });
    }
  }
  return rows.map((r) => {
    const phone = (r.phone as string) ?? null;
    const out = sent.get(Number(r.id));
    return {
      lead_id: r.id,
      name: r.name,
      category: r.category,
      region: r.region,
      state: r.state,
      city: r.city,
      address: r.address,
      latitude: r.lat,
      longitude: r.lon,
      phone: phone,
      whatsapp_ready: isWhatsAppNumber(phone) ? "yes" : "no",
      whatsapp_link: waLink(phone) ?? "",
      email: r.admissions_email || r.email || null,
      admissions_email: r.admissions_email,
      alt_email: r.email,
      website: r.website,
      website_up: r.website_up ? "yes" : "no",
      https_secure: r.https_secure ? "yes" : "no",
      mobile_friendly: r.mobile_friendly ? "yes" : "no",
      app_status: r.app_status,
      rating: r.rating,
      reviews: r.reviews,
      google_maps: r.maps_link,
      principal_owner_name: r.principal_name || r.owner_name || null,
      principal_name: r.principal_name,
      owner_name: r.owner_name,
      year_established: r.year_established,
      student_strength: r.student_strength,
      branches: r.branches,
      instagram: r.instagram,
      facebook: r.facebook,
      linkedin: r.linkedin,
      youtube: r.youtube,
      contact_source: r.contact_source,
      site_verified: r.site_verified ? "yes" : "no",
      mailbox_status: r.mailbox_status,
      opportunity_priority: r.opportunity_priority,
      opportunity_type: r.opportunity_type,
      stage: r.stage,
      folder_status: r.folder_status,
      verified_contact: r.verified_contact ? "yes" : "no",
      last_outreach_channel: out?.channel ?? "",
      last_outreach_status: out?.status ?? "",
      last_outreach_sent_at: out?.sent_at ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      finished_at: r.finished_at,
      sent_at: r.sent_at,
      bounced: r.bounced ? "yes" : "no",
    };
  });
}

export function csvFromRows(rows: Record<string, unknown>[]): string {
  const header = rows.length ? Object.keys(rows[0]) : [];
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.map(escape).join(",")];
  for (const r of rows) lines.push(header.map((h) => escape(r[h])).join(","));
  return lines.join("\r\n");
}