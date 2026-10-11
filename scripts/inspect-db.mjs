import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("data/agencyos.db", { readOnly: true });
const q = (sql, ...a) => db.prepare(sql).all(...a);
const one = (sql, ...a) => db.prepare(sql).get(...a);

console.log("--- OUTREACH BY STATUS ---");
for (const r of q("SELECT status, COUNT(*) n FROM outreach_queue GROUP BY status ORDER BY n DESC"))
  console.log(`  ${r.status}: ${r.n}`);

console.log("\n--- INSTITUTIONS: bounced flag ---");
console.log(one("SELECT COUNT(*) n FROM institutions WHERE bounced = 1").n, "bounced");
console.log(one("SELECT COUNT(*) n FROM institutions WHERE verified_contact = 1").n, "verified_contact=1");
console.log(one("SELECT COUNT(*) n FROM institutions WHERE email IS NOT NULL AND email <> ''").n, "have email");

console.log("\n--- INBOX THREADS BY KIND ---");
for (const r of q("SELECT kind, COUNT(*) n FROM inbox_threads GROUP BY kind ORDER BY n DESC"))
  console.log(`  ${r.kind}: ${r.n}`);

console.log("\n--- INBOUND (sent) message sample ---");
for (const r of q("SELECT id, institution_id, status, subject, sent_at, sent_message_id FROM outreach_queue WHERE status='sent' ORDER BY id DESC LIMIT 5"))
  console.log(`  #${r.id} inst=${r.institution_id} ${r.sent_at} mid=${r.sent_message_id} subj=${String(r.subject).slice(0, 50)}`);

console.log("\n--- BOUNCED institutions (sample 25) ---");
for (const r of q("SELECT id, name, state, email, stage FROM institutions WHERE bounced = 1 LIMIT 25"))
  console.log(`  #${r.id} ${r.name} | ${r.state} | email=${JSON.stringify(r.email)} | ${r.stage}`);

console.log("\n--- STAGE COUNTS ---");
for (const r of q("SELECT stage, COUNT(*) n FROM institutions GROUP BY stage ORDER BY n DESC"))
  console.log(`  ${r.stage}: ${r.n}`);

console.log("\n--- settings smtp.pass raw length/format ---");
const p = one("SELECT value FROM settings WHERE key='smtp.pass'").value;
console.log(JSON.stringify(String(p).replace(/[a-z0-9]/g, "x")));
