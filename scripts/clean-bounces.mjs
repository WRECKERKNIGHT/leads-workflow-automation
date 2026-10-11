/**
 * One-off cleanup: record every Delivery Status Notification in the DB, then
 * permanently delete them from the Gmail INBOX so the mailbox is readable
 * again. The institution whose address hard-bounced is quarantined so the
 * pipeline can never draft to it again.
 *
 * Usage: node scripts/clean-bounces.mjs            (dry run, lists only)
 *        node scripts/clean-bounces.mjs --delete   (actually deletes)
 */
import { DatabaseSync } from "node:sqlite";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const APPLY = process.argv.includes("--delete");

const db = new DatabaseSync("data/agencyos.db");
const setting = (k) => db.prepare("SELECT value FROM settings WHERE key = ?").get(k)?.value ?? "";
const user = setting("smtp.user");
const pass = String(setting("smtp.pass")).replace(/\s+/g, "");

const BOUNCE_FROM = /(mailer-daemon|postmaster|mail delivery subsystem|delivery failure)/i;
const BOUNCE_SUBJECT = /(delivery status notification|undeliverable|returned mail|failure notice|could not be delivered|address not found|mail delivery failed|delivery has failed|has been bounced|returned to sender)/i;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// The sender's own VERP return-path shows up in every DSN. It is NOT the
// address that failed, so it must never be treated as a bounced lead.
const NOT_A_RECIPIENT = /mailer-daemon|postmaster|crash2\.zhihu\.com|@googlemail\.com$/i;

const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });

/** Pull the real failed recipient out of a parsed DSN. */
function failedRecipientsOf(parsed) {
  // 1) Structured DSN headers — the authoritative source.
  for (const h of ["x-original-to", "final-recipient", "original-recipient", "x-failed-recipients", "failed-recipient"]) {
    const v = parsed.headers.get(h);
    if (v) {
      const m = String(v).match(EMAIL_RE);
      if (m) return [m[0].toLowerCase()];
    }
  }
  // 2) Fall back to the human-readable part, skipping the VERP envelope sender.
  const text = `${parsed.text ?? ""}`;
  const all = [...new Set((text.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))];
  return all.filter((e) => !NOT_A_RECIPIENT.test(e));
}

const plan = [];

try {
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const uids = (await client.search({ since: new Date(Date.now() - 400 * 86400000) }, { uid: true })) ?? [];

    for await (const m of client.fetch(uids, { envelope: true }, { uid: true })) {
      const from = String(m.envelope?.from?.[0]?.address ?? "").toLowerCase();
      const fromName = String(m.envelope?.from?.[0]?.name ?? "");
      const sub = String(m.envelope?.subject ?? "");
      if (!(BOUNCE_FROM.test(from) || BOUNCE_FROM.test(fromName) || BOUNCE_SUBJECT.test(sub))) continue;
      plan.push(m.uid);
    }

    console.log(`DSNs found: ${plan.length}`);

    // Record what failed, and quarantine those institutions.
    const quarantined = [];
    for (const uid of plan) {
      for await (const m of client.fetch(uid, { source: true }, { uid: true })) {
        const parsed = await simpleParser(m.source);
        for (const addr of failedRecipientsOf(parsed)) {
          if (NOT_A_RECIPIENT.test(addr)) continue;
          const inst = db
            .prepare("SELECT id, name FROM institutions WHERE LOWER(email) = ? OR LOWER(admissions_email) = ? LIMIT 1")
            .get(addr, addr);
          if (!inst) {
            console.log(`  uid=${uid} failed=${addr} -> no matching institution (ignored)`);
            continue;
          }
          console.log(`  uid=${uid} failed=${addr} -> #${inst.id} ${inst.name}`);
          db.prepare("UPDATE institutions SET email = '', admissions_email = '', verified_contact = 0, bounced = 1 WHERE id = ?").run(inst.id);
          db.prepare(
            "UPDATE outreach_queue SET status = 'rejected', decisions = ? WHERE institution_id = ? AND status IN ('pending_approval','approved','pending_smtp')"
          ).run(`hard bounce — ${addr}`, inst.id);
          quarantined.push({ id: inst.id, name: inst.name, addr });
        }
      }
    }

    console.log(`\nQuarantined ${quarantined.length} institution(s):`);
    for (const q of quarantined) console.log(`  #${q.id} ${q.name} <${q.addr}>`);

    if (!APPLY) {
      console.log("\nDRY RUN — nothing deleted. Re-run with --delete to remove the DSNs.");
    } else {
      // Gmail convention: flag \Deleted, then let the mailbox lock expunge on
      // release (needExpunge is the ImapFlow way to request that).
      await client.messageFlagsAdd(plan, ["\\Deleted"], { uid: true });
      lock.needExpunge = true;
      console.log(`\nFlagged ${plan.length} DSN(s) \Deleted — expunging on release.`);
    }
  } finally {
    lock.release();
  }
} catch (e) {
  console.error("ERROR:", e.message);
  process.exitCode = 1;
} finally {
  try { await client.logout(); } catch {}
}
