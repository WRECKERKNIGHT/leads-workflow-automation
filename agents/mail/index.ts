import { ImapFlow, type FetchMessageObject } from "imapflow";
import { simpleParser } from "mailparser";
import { mailConfigured, runtimeMail } from "@/lib/config";
import { getDb } from "@/lib/db";
import {
  getSetting,
  setSetting,
  upsertAgentRun,
  pushOfficeEvent,
  logAgent,
  createInboxThread,
  findThreadByMsgId,
  findInstitutionByEmail,
  institutionIdForSentMessageId,
  getInstitution,
  updateInstitution,
  updateOutreach,
  outreachForInstitution,
} from "@/lib/db/repo";
import { receiveInboundReply } from "@/agents/sender";
import type { Institution } from "@/agents/types";

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const BOUNCE_FROM = /(mailer-daemon|postmaster|mail delivery subsystem|delivery failure|malta|stripe)/i;
const BOUNCE_SUBJECT = /(delivery status notification|undeliverable|returned mail|failure notice|could not be delivered|address not found|mail delivery failed|delivery has failed|has been bounced|returned to sender)/i;
const OOO_SUBJECT = /(out of office|out-of-office|auto-?reply|automatic reply|vacation|away until|at the moment I have access to email)/i;
const GOOGLE_ALERT = /(security alert|sign-in|new device|app password|suspicious sign-in|critically low|storage full)/i;
const BRAND_RE = /\b(edusuite|wreckerai|student developer|demo|school app|school-management|website for (your )?school)\b/i;
const SCHOOLISH_RE = /\b(school|college|academy|vidyalaya|mandir|institute|higher secondary|campus)\b/i;
const PRODUCTISH_RE = /\b(website|web ?site|app|digital|demo|edusuite|wreckerai|student ?developer|admission|principal|brochure|online|advertise|management|software)\b/i;

let running = false;

export interface MailSyncResult {
  added: number;
  bounces: number;
  errors: number;
  skipped: number;
}

/**
 * Mail Monitor — watches the real Gmail inbox over IMAP (same app-password
 * credentials as SMTP). Every poll it:
 *   * classifies new mail: replies, bounces, out-of-office, google alerts.
 *   * bounces → quarantines the school's address (cleared, can never send
 *     again) and rejects queued drafts to it.
 *   * replies → matched to the school via our stored Message-ID, the sender
 *     address, and routed into the Response Manager for LLM classification.
 * Read-only: it never moves, deletes or edits anything in the mailbox.
 */
export async function runMailSync(): Promise<MailSyncResult> {
  const empty: MailSyncResult = { added: 0, bounces: 0, errors: 0, skipped: 0 };
  if (running) return empty;
  if (!mailConfigured()) {
    if (!getSetting("mail.warned")) {
      setSetting("mail.warned", "1");
      pushOfficeEvent("warning", "📭 Mail Monitor idle — set a Gmail app password in Settings (SMTP) to start watching the inbox", {
        agentId: "mail_monitor",
        icon: "📭",
      });
    }
    return empty;
  }

  running = true;
  try {
    return await race(syncOnce(), 150_000);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    saveStatus("error", `Mail sync failed: ${msg}`.slice(0, 120));
    logAgent("mail_monitor", `Mail sync error: ${msg}`, { level: "error" });
    pushOfficeEvent("error", `📭 Mail Monitor error: ${msg.slice(0, 120)}`, { agentId: "mail_monitor", icon: "📭" });
    return empty;
  } finally {
    running = false;
  }
}

async function syncOnce(): Promise<MailSyncResult> {
  const m = runtimeMail();
  const summary: MailSyncResult = { added: 0, bounces: 0, errors: 0, skipped: 0 };
  const client = new ImapFlow({
    host: m.host,
    port: m.port,
    secure: m.secure,
    auth: { user: m.user, pass: m.pass },
    logger: false,
  });

  try {
    upsertAgentRun("mail_monitor", { status: "working", current_task: `Connecting ${m.host} …`, progress: 10 });
    await connectWithTimeout(client, 25_000);
    upsertAgentRun("mail_monitor", { status: "working", current_task: "Authenticated — opening INBOX", progress: 20 });

    const lock = await race(client.getMailboxLock("INBOX"), 20_000);
    try {
      const lastUid = Number(getSetting("mail.inbox.lastUid") ?? "0") || 0;
      upsertAgentRun("mail_monitor", { status: "working", current_task: `INBOX sync (newer than UID ${lastUid})`, progress: 30 });

      // Scope the scan to recent mail only (recency bound), then to messages
      // that could possibly relate to the system (bounces, google alerts,
      // replies referencing our schools/brand). The user's personal inbox is
      // never ingested wholesale.
      const windowDays = Math.max(Number(getSetting("mail.windowDays") ?? "30") || 30, 1);
      const uids = (await client.search(
        { uid: `${lastUid + 1}:*`, since: imapDate(new Date(Date.now() - windowDays * 86_400_000)) },
        { uid: true }
      )) as number[] | false | undefined;
let newest = lastUid;
      let processed = 0;
      const MAX_PER_POLL = 400;
      if (uids && uids.length) {
        // Pass 1 — envelope-only relevance gate (never interleave another
        // IMAP command inside the fetch stream: that deadlocks the session).
        const relevant: number[] = [];
        for await (const msg of client.fetch(uids, { envelope: true }, { uid: true })) {
          if (msg.uid > newest) newest = msg.uid;
          const envSub = String(msg.envelope?.subject ?? "");
          const envFrom = String(msg.envelope?.from?.[0]?.address ?? "").toLowerCase();
          if (relevantEnvelope(envSub, envFrom)) {
            relevant.push(msg.uid);
          } else {
            summary.skipped++;
          }
          processed++;
          setSetting("mail.inbox.lastUid", String(newest));
          if (processed >= MAX_PER_POLL) break;
        }
        upsertAgentRun("mail_monitor", { status: "working", current_task: `Rendering ${relevant.length} relevant message(s)`, progress: 75 });

        // Pass 2 — batch-fetch bodies for exactly the relevant UIDs and classify.
        if (relevant.length) {
          for await (const msg of client.fetch(relevant, { source: true }, { uid: true })) {
            const envSub = String(msg.envelope?.subject ?? "");
            const outcome = await handleMessage(msg as unknown as FetchMessageObject).catch((err) => {
              logAgent("mail_monitor", `Failed to process msg ${msg.uid} (${envSub.slice(0, 40)}): ${err instanceof Error ? err.message : String(err)}`, { level: "error" });
              return null;
            });
            if (outcome) {
              summary.added++;
              if (outcome === "bounce") summary.bounces++;
              if (outcome === "error") summary.errors++;
            } else {
              summary.skipped++;
            }
            upsertAgentRun("mail_monitor", { status: "working", current_task: `Processed UID ${msg.uid}`, progress: 78 + Math.min(20, summary.added * 2) });
          }
        }
      }
    } finally {
      lock.release();
    }

    setSetting("mail.inbox.lastSyncAt", new Date().toISOString());
    if (summary.added) {
      pushOfficeEvent("mail", `📬 Mail sync: ${summary.added} new message(s) · ${summary.bounces} bounce · ${summary.errors} error`, {
        agentId: "mail_monitor",
        icon: "📬",
        data: summary,
      });
    }
    saveStatus("waiting", `INBOX watched · last sync ${new Date().toLocaleTimeString()}`);
    logAgent(
      "mail_monitor",
      `Mail sync OK — ${summary.added} new (${summary.bounces} bounce, ${summary.errors} error), ${summary.skipped} skipped`,
      { level: summary.bounces ? "warn" : "info" }
    );
    return summary;
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
  }
}

function saveStatus(status: "working" | "waiting" | "error", currentTask: string) {
  upsertAgentRun("mail_monitor", { status, current_task: currentTask, progress: status === "waiting" ? 100 : 0 });
}

function connectWithTimeout(client: ImapFlow, ms: number): Promise<void> {
  return race(client.connect(), ms);
}

/** Race a promise against a hard deadline so a stalled IMAP session can't hang the engine. */
function race<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(() => rej(new Error(`IMAP operation timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (t) clearTimeout(t);
  });
}

/** IMAP SINCE date string, e.g. "8-Sep-2026" (searches Gmail's internal date). */
function imapDate(d: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${String(d.getUTCDate())}-${months[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

/**
 * Envelope-level relevance gate: only messages that could relate to the
 * system are downloaded and processed. Everything else (personal notifications,
 * newsletters, DMs, etc.) is skipped — its UID still advances the cursor.
 *
 * High-precision only: bounces, google security alerts, auto-replies, mail
 * from a school we know, brand keywords, or a subject that mentions a school
 * AND our product area. Plain bag-of-words institutional-name matching was too
 * noisy (english, model, senior, school… matched marketing spam).
 */
function relevantEnvelope(subject: string, from: string): boolean {
  const sub = subject.toLowerCase();
  const f = from.toLowerCase();
  if (!sub && !f) return false; // no envelope — nothing safe to classify
  if (BOUNCE_FROM.test(f) || BOUNCE_SUBJECT.test(sub)) return true;
  if (OOO_SUBJECT.test(sub)) return true;
  if (GOOGLE_ALERT.test(sub) && /google/i.test(f)) return true;
  if (BRAND_RE.test(sub)) return true;
  if (f && findInstitutionByEmail(f)) return true;
  if (SCHOOLISH_RE.test(sub) && PRODUCTISH_RE.test(sub)) return true;
  return false;
}

/** Returns the outcome kind for counting, or null when already-seen/unprocessable. */
async function handleMessage(msg: FetchMessageObject): Promise<"reply" | "bounce" | "error" | "other" | null> {
  if (!msg.source) return null;
  const parsed = await simpleParser(msg.source);
  const msgId = String(parsed.messageId ?? "").trim();
  if (msgId && findThreadByMsgId(msgId)) return null; // already synced (dedupe)

  const subject = String(parsed.subject ?? "");
  const from = addressOf(parsed.from);
  const fromLower = from.toLowerCase();
  const body = ((parsed.text ?? "").trim() || stripHtml(String(parsed.html ?? ""))) .slice(0, 8000);

  // --- Bounce / delivery failure -----------------------------------------
  if (BOUNCE_FROM.test(fromLower) || BOUNCE_SUBJECT.test(subject)) {
    const failed = findFailedAddress(parsed);
    const inst = failed ? findInstitutionByEmail(failed) : null;
    if (inst && failed) handleBounce(inst, failed, subject, from, body);
    else {
      pushOfficeEvent("mail_flag", `📭 Unhandled bounce: ${failed ? `${failed} — ` : ""}${subject.slice(0, 60)}`, {
        agentId: "mail_monitor",
        icon: "📭",
        data: { from, failed },
      });
    }
    createInboxThread(inst?.id ?? 0, subject, from, body, null, "bounce", msgId);
    return "bounce";
  }

  // --- Google / account alerts ---------------------------------------------
  if (GOOGLE_ALERT.test(subject) && /google/i.test(fromLower)) {
    createInboxThread(0, subject, from, body, null, "error", msgId);
    pushOfficeEvent("error", `🚨 Gmail alert: ${subject.slice(0, 70)}`, { agentId: "mail_monitor", icon: "🚨", data: { from } });
    return "error";
  }

  // --- Out-of-office auto replies ------------------------------------------
  if (OOO_SUBJECT.test(subject)) {
    const inst = matchReplyInstitution(parsed, from);
    createInboxThread(inst?.id ?? 0, subject, from, body, null, "out_of_office", msgId);
    pushOfficeEvent("reply", `⏳ Out-of-office: ${inst?.name ?? "unknown"} <${from}>`, { agentId: "mail_monitor", icon: "⏳" });
    logAgent("mail_monitor", `OOO auto-reply from ${from}`, { institutionId: inst?.id });
    return "other";
  }

  // --- Anything else is treated as a reply ----------------------------------
  const inst = matchReplyInstitution(parsed, from);
  if (inst) {
    receiveInboundReply(inst.id, subject, from, body);
    logAgent("mail_monitor", `Reply matched to ${inst.name} <${from}>`, { institutionId: inst.id });
  } else {
    createInboxThread(0, subject, from, body, null, "reply", msgId);
    pushOfficeEvent("mail_flag", `📥 Reply from unknown sender <${from}>: ${subject.slice(0, 60)}`, {
      agentId: "mail_monitor",
      icon: "📥",
      data: { from },
    });
  }
  return "reply";
}

/** A real bounce: quarantine the address so it can never be sent to again. */
function handleBounce(inst: { id: number; name: string }, failed: string, subject: string, from: string, body: string) {
  void body;
  updateInstitution(inst.id, {
    email: "",
    admissions_email: "",
    verified_contact: 0,
  });
  try {
    getDb()
      .prepare("UPDATE institutions SET bounced = 1 WHERE id = ?")
      .run(inst.id);
  } catch {
    /* ignore */
  }
  // Clear any queued drafts to this school so we never retry a dead address.
  for (const o of outreachForInstitution(inst.id)) {
    if (o.status === "pending_approval" || o.status === "approved" || o.status === "pending_smtp") {
      updateOutreach(o.id, { status: "rejected", decisions: `bounced — ${failed}` });
    }
  }
  pushOfficeEvent("bounce", `📭 Bounced: ${inst.name} <${failed}>`, {
    agentId: "mail_monitor",
    icon: "📭",
    data: { subject, from },
  });
  logAgent("mail_monitor", `Bounce for ${inst.name} @ ${failed} — contact quarantined (${subject.slice(0, 60)})`, {
    level: "warn",
    institutionId: inst.id,
  });
}

/** Link a reply back to the school we emailed. */
function matchReplyInstitution(parsed: Awaited<ReturnType<typeof simpleParser>>, from: string): { id: number; name: string } | null {
  const refs = [parsed.inReplyTo, parsed.references].filter(Boolean).flatMap((r) => String(r).split(/\s+/));
  for (const ref of refs) {
    const id = institutionIdForSentMessageId(ref.trim());
    if (id) {
      const inst = getInstitution(id) as Institution | null;
      if (inst) return { id, name: inst.name };
    }
  }
  if (from) {
    const byEmail = findInstitutionByEmail(from);
    if (byEmail) return byEmail;
  }
  return null;
}

/** Pull the failed recipient out of a bounce message. */
function findFailedAddress(parsed: Awaited<ReturnType<typeof simpleParser>>): string | null {
  const headers = ["x-failed-recipients", "failed-recipient", "final-recipient", "original-recipient"] as const;
  for (const h of headers) {
    const v = parsed.headers.get(h);
    if (v) {
      const m = String(v).match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
      if (m) return m[0].toLowerCase();
    }
  }
  const text = `${parsed.text ?? ""} ${stripHtml(String(parsed.html ?? ""))}`;
  const emails = [...new Set(text.match(EMAIL_RE)?.map((e) => e.toLowerCase()) ?? [])];
  // Prefer an address that belongs to an institution we know.
  for (const e of emails) {
    const inst = findInstitutionByEmail(e);
    if (inst) return e;
  }
  // Otherwise the most human-looking non-Gmail address in the body.
  const candidates = emails.filter((e) => !/(gmail\.com|googlemail\.com|mailer-daemon|postmaster)/i.test(e));
  return candidates[0] ?? null;
}

function addressOf(addr: Awaited<ReturnType<typeof simpleParser>>["from"]): string {
  const v = addr?.value?.[0];
  return v?.address ? String(v.address).toLowerCase() : "";
}

function stripHtml(html: string): string {
  return String(html)
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}