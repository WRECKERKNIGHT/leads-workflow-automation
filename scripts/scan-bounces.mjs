import { DatabaseSync } from "node:sqlite";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

const db = new DatabaseSync("data/agencyos.db", { readOnly: true });
const setting = (k) => db.prepare("SELECT value FROM settings WHERE key = ?").get(k)?.value ?? "";
const user = setting("smtp.user");
const pass = String(setting("smtp.pass")).replace(/\s+/g, "");

const client = new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user, pass }, logger: false });

const BOUNCE_FROM = /(mailer-daemon|postmaster|mail delivery subsystem|delivery failure)/i;
const BOUNCE_SUBJECT = /(delivery status notification|undeliverable|returned mail|failure notice|could not be delivered|address not found|mail delivery failed|delivery has failed|has been bounced|returned to sender)/i;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const results = [];

try {
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    // Search the WHOLE mailbox, no date bound.
    const all = await client.search({ since: new Date(Date.now() - 400 * 86400000) }, { uid: true });
    console.log(`scanning ${all?.length ?? 0} messages in last 400 days\n`);

    const cand = [];
    for await (const m of client.fetch(all, { envelope: true, internalDate: true }, { uid: true })) {
      const from = String(m.envelope?.from?.[0]?.address ?? "").toLowerCase();
      const fromName = String(m.envelope?.from?.[0]?.name ?? "");
      const sub = String(m.envelope?.subject ?? "");
      if (BOUNCE_FROM.test(from) || BOUNCE_FROM.test(fromName) || BOUNCE_SUBJECT.test(sub)) {
        cand.push(m.uid);
      }
    }
    console.log(`bounce candidates: ${cand.length}\n`);

    for (const uid of cand) {
      for await (const m of client.fetch(uid, { source: true }, { uid: true })) {
        const parsed = await simpleParser(m.source);
        const text = `${parsed.text ?? ""}`;
        const hdrFailed =
          ["x-failed-recipients", "final-recipient", "original-recipient", "failed-recipient"]
            .map((h) => parsed.headers.get(h))
            .filter(Boolean)
            .join(" ");
        const all_ = [...new Set([...(hdrFailed.match(EMAIL_RE) ?? []), ...(text.match(EMAIL_RE) ?? [])])]
          .map((e) => e.toLowerCase())
          .filter((e) => !/mailer-daemon|postmaster|googlemail|google\.com/.test(e));
        const status = /failure/i.test(String(parsed.subject)) ? "FAILURE" : "DELAY";
        results.push({
          uid,
          status,
          subject: String(parsed.subject),
          date: parsed.date ? parsed.date.toISOString() : null,
          failed: all_,
        });
      }
    }
  } finally {
    lock.release();
  }
} catch (e) {
  console.error("IMAP ERROR:", e.message);
} finally {
  try { await client.logout(); } catch {}
}

console.log("=== DETAILS ===");
const failedAddrs = new Set();
for (const r of results) {
  const unique = [...new Set(r.failed)];
  unique.forEach((a) => failedAddrs.add(a));
  console.log(`uid=${r.uid} [${r.status}] ${r.date}`);
  console.log(`   subj: ${r.subject.slice(0, 90)}`);
  console.log(`   failed: ${unique.join(", ").slice(0, 300) || "(none found)"}`);
}
console.log(`\n=== UNIQUE FAILED ADDRESSES: ${failedAddrs.size} ===`);
[...failedAddrs].sort().forEach((a) => console.log("  " + a));
