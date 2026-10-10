import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "agencyos.db");

fs.mkdirSync(DATA_DIR, { recursive: true });

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!db) {
      db = new DatabaseSync(DB_PATH);
      db.exec("PRAGMA journal_mode = WAL;");
      // WAL lets a long maintenance script (e.g. the location backfill) hold the
      // write lock without the running server failing its reads.
      db.exec("PRAGMA busy_timeout = 15000;");
    db.exec("PRAGMA foreign_keys = ON;");
    migrate(db);
  }
  return db;
}

export function runInTransaction<T>(fn: (db: DatabaseSync) => T): T {
  const d = getDb();
  const hadTransaction = d.isTransaction;
  if (!hadTransaction) d.exec("BEGIN");
  try {
    const result = fn(d);
    if (!hadTransaction) d.exec("COMMIT");
    return result;
  } catch (err) {
    if (!hadTransaction) d.exec("ROLLBACK");
    throw err;
  }
}

function migrate(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS missions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      region TEXT NOT NULL DEFAULT 'All India',
      category TEXT NOT NULL,
      limit_n INTEGER NOT NULL DEFAULT 40,
      filters TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS institutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mission_id INTEGER NOT NULL REFERENCES missions(id),
      name TEXT NOT NULL,
      category TEXT,
      region TEXT,
      state TEXT,
      lat REAL,
      lon REAL,
      address TEXT,
      website TEXT,
      phone TEXT,
      email TEXT,
      maps_link TEXT,
      rating REAL,
      reviews INTEGER,
      stage TEXT NOT NULL DEFAULT 'discovery',
      folder_status TEXT NOT NULL DEFAULT 'in_progress',
      error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      finished_at TEXT,
      last_agent TEXT,

      principal_name TEXT,
      owner_name TEXT,
      admissions_email TEXT,
      whatsapp_available INTEGER DEFAULT 0,
      instagram TEXT,
      facebook TEXT,
      linkedin TEXT,
      youtube TEXT,
      year_established TEXT,
      student_strength TEXT,
      branches TEXT,
      verified_contact INTEGER DEFAULT 0,

      website_up INTEGER DEFAULT 0,
      https_secure INTEGER DEFAULT 0,
      mobile_friendly INTEGER DEFAULT 0,
      app_status TEXT DEFAULT 'unverified',
      app_evidence TEXT,
      sources_checked TEXT,
      research_confidence TEXT,
      has_admission_form INTEGER DEFAULT 0,
      has_fee_payment INTEGER DEFAULT 0,
      has_chatbot INTEGER DEFAULT 0,
      social_active INTEGER DEFAULT 0,
      research_notes TEXT,

      opportunity_type TEXT,
      opportunity_reason TEXT,
      opportunity_priority TEXT,

      plan_tier TEXT,
      demo_notes TEXT,

      message_subject TEXT,
      message_body TEXT,
      sent_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_inst_mission ON institutions(mission_id);
    CREATE INDEX IF NOT EXISTS idx_inst_stage ON institutions(stage);
    CREATE INDEX IF NOT EXISTS idx_inst_status ON institutions(folder_status);

    CREATE TABLE IF NOT EXISTS agent_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      mission_id INTEGER,
      institution_id INTEGER,
      status TEXT NOT NULL DEFAULT 'waiting',
      current_task TEXT,
      progress INTEGER NOT NULL DEFAULT 0,
      queue INTEGER NOT NULL DEFAULT 0,
      last_action TEXT,
      error TEXT,
      started_at TEXT,
      finished_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_runs_agent ON agent_runs(agent_id);

    CREATE TABLE IF NOT EXISTS agent_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      mission_id INTEGER,
      institution_id INTEGER,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_logs_created ON agent_logs(created_at);

    CREATE TABLE IF NOT EXISTS agent_outputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      institution_id INTEGER NOT NULL,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS outreach_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL,
      channel TEXT NOT NULL DEFAULT 'email',
      subject TEXT,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending_approval',
      follow_up_num INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at TEXT,
      decisions TEXT,
      sent_message_id TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach_queue(status);

    CREATE TABLE IF NOT EXISTS pipeline_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL,
      from_stage TEXT,
      to_stage TEXT,
      event TEXT NOT NULL,
      agent_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pevents_created ON pipeline_events(created_at);

    CREATE TABLE IF NOT EXISTS office_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      icon TEXT,
      data_json TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inbox_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER,
      subject TEXT,
      from_addr TEXT,
      last_body TEXT,
      classification TEXT,
      status TEXT,
      kind TEXT NOT NULL DEFAULT 'reply',
      msg_id TEXT,
      synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER,
      type TEXT,
      scheduled_for TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS demos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL,
      plan_tier TEXT,
      title TEXT,
      body TEXT NOT NULL,
      services TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_demos_inst ON demos(institution_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- Audit trail: one row per verification decision, so every send is
    -- explainable after the fact.
    CREATE TABLE IF NOT EXISTS email_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      institution_id INTEGER NOT NULL,
      outreach_id INTEGER,
      email TEXT NOT NULL,
      domain TEXT,
      status TEXT NOT NULL,
      checks_json TEXT,
      reason TEXT,
      auto_approved INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_verif_inst ON email_verifications(institution_id);
    CREATE INDEX IF NOT EXISTS idx_verif_status ON email_verifications(status);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_verif_email ON email_verifications(email);
  `);

  ensureColumn(db, "missions", "region", "TEXT NOT NULL DEFAULT 'All India'");
  ensureColumn(db, "institutions", "website_up", "INTEGER DEFAULT 0");
  ensureColumn(db, "institutions", "app_status", "TEXT DEFAULT 'unverified'");
  ensureColumn(db, "institutions", "app_evidence", "TEXT");
  ensureColumn(db, "institutions", "sources_checked", "TEXT");
  ensureColumn(db, "institutions", "research_confidence", "TEXT");
  ensureColumn(db, "institutions", "opportunity_type", "TEXT");
  ensureColumn(db, "institutions", "opportunity_reason", "TEXT");
  ensureColumn(db, "institutions", "plan_tier", "TEXT");
  ensureColumn(db, "institutions", "demo_notes", "TEXT");
  ensureColumn(db, "institutions", "message_subject", "TEXT");
  ensureColumn(db, "institutions", "message_body", "TEXT");
  ensureColumn(db, "institutions", "sent_at", "TEXT");
  ensureColumn(db, "institutions", "verified_contact", "INTEGER DEFAULT 0");
  ensureColumn(db, "agent_runs", "error", "TEXT");
  ensureColumn(db, "outreach_queue", "sent_message_id", "TEXT");
  ensureColumn(db, "institutions", "bounced", "INTEGER DEFAULT 0");
  ensureColumn(db, "inbox_threads", "kind", "TEXT NOT NULL DEFAULT 'reply'");
  ensureColumn(db, "inbox_threads", "msg_id", "TEXT");
  ensureColumn(db, "inbox_threads", "synced_at", "TEXT");
  ensureColumn(db, "institutions", "contact_source", "TEXT");
  ensureColumn(db, "institutions", "site_verified", "INTEGER DEFAULT 0");
  ensureColumn(db, "institutions", "site_match_reason", "TEXT");
  ensureColumn(db, "institutions", "mailbox_status", "TEXT DEFAULT 'unverified'");
  ensureColumn(db, "institutions", "mailbox_checked_at", "TEXT");
  ensureColumn(db, "institutions", "mailbox_detail", "TEXT");
  // Discovered leads originally had their state assigned by cycling a state list
  // rather than by geography, so the true city is stored alongside it.
  ensureColumn(db, "institutions", "city", "TEXT");
  ensureColumn(db, "institutions", "location_source", "TEXT");
  ensureColumn(db, "pipeline_events", "detail", "TEXT");
  ensureColumn(db, "outreach_queue", "verdict", "TEXT");
  ensureColumn(db, "outreach_queue", "verified_at", "TEXT");
  ensureColumn(db, "outreach_queue", "attempts", "INTEGER DEFAULT 0");
}

/** Add a column to an existing table if it doesn't exist yet (SQLite-safe). */
function ensureColumn(db: DatabaseSync, table: string, col: string, ddl: string) {
  const found = (
    db.prepare(`SELECT COUNT(*) n FROM pragma_table_info(?) WHERE name = ?`) as unknown as {
      get: (a: unknown, b: unknown) => { n: number };
    }
  ).get(table, col) as { n: number };
  try {
    if (found.n === 0) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
  } catch {
    // column may already exist in some migration states
  }
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}