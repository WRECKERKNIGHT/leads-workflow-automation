import { DatabaseSync } from "node:sqlite";
import { ImapFlow } from "imapflow";

const db = new DatabaseSync("data/agencyos.db", { readOnly: true });
const setting = (k) => db.prepare("SELECT value FROM settings WHERE key = ?").get(k)?.value ?? "";

const user = setting("smtp.user");
const pass = String(setting("smtp.pass")).replace(/\s+/g, "");
const host = "imap.gmail.com";

console.log(`Connecting to ${host} as ${user} …`);

const client = new ImapFlow({ host, port: 993, secure: true, auth: { user, pass }, logger: false });

const BOUNCE_FROM = /(mailer-daemon|postmaster|mail delivery subsystem|delivery failure)/i;
const BOUNCE_SUBJECT = /(delivery status notification|undeliverable|returned mail|failure notice|could not be delivered|address not found|mail delivery failed|delivery has failed|has been bounced|returned to sender)/i;

try {
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const box = await client.mailboxOpen("INBOX");
    console.log(`INBOX total: ${box.exists} messages`);

    // Search all bounce-ish mail, no date restriction.
    const uids = await client.search({ seen: false }, { uid: true });
    console.log(`unseen: ${uids ? uids.length : 0}`);

    const all = await client.search({ since: new Date(Date.now() - 120 * 86400000) }, { uid: true });
    console.log(`last 120 days: ${all ? all.length : 0}`);

    const bounces = [];
    if (all && all.length) {
      for await (const m of client.fetch(all, { envelope: true, internalDate: true }, { uid: true })) {
        const from = String(m.envelope?.from?.[0]?.address ?? "").toLowerCase();
        const fromName = String(m.envelope?.from?.[0]?.name ?? "");
        const sub = String(m.envelope?.subject ?? "");
        if (BOUNCE_FROM.test(from) || BOUNCE_FROM.test(fromName) || BOUNCE_SUBJECT.test(sub)) {
          bounces.push({ uid: m.uid, from, fromName, subject: sub, date: m.internalDate ? new Date(m.internalDate).toISOString() : null });
        }
      }
    }
    console.log(`\n=== BOUNDE CANDIDATES: ${bounces.length} ===`);
    for (const b of bounces.slice(0, 40)) {
      console.log(`  uid=${b.uid} | ${b.date} | ${b.from} | ${b.subject.slice(0, 80)}`);
    }
    if (bounces.length > 40) console.log(`  … and ${bounces.length - 40} more`);
  } finally {
    lock.release();
  }
} catch (e) {
  console.error("IMAP ERROR:", e.message);
} finally {
  try { await client.logout(); } catch {}
}
