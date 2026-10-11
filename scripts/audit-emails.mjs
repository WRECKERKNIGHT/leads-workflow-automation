import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("data/agencyos.db", { readOnly: true });

console.log("=== ALL outreach with a recipient institution ===");
const rows = db
  .prepare(
    `SELECT o.id oid, o.status, o.sent_at, i.name, i.state, i.email, i.admissions_email, i.website, i.verified_contact, i.bounced
     FROM outreach_queue o JOIN institutions i ON i.id=o.institution_id
     ORDER BY o.id`
  )
  .all();

const byStatus = {};
for (const r of rows) (byStatus[r.status] ??= []).push(r);
for (const [s, list] of Object.entries(byStatus)) console.log(`  ${s}: ${list.length}`);

console.log("\n=== SENT EMAILS (the ones that actually went out) ===");
for (const r of byStatus.sent ?? []) {
  console.log(`  #${r.oid} ${r.name} [${r.state}] -> ${r.admissions_email || r.email}  (site=${r.website ?? "-"})`);
}

console.log("\n=== ALL 163 institutions holding an email ===");
const held = db
  .prepare(
    `SELECT id, name, state, email, admissions_email, website, verified_contact, bounced, stage
     FROM institutions WHERE email IS NOT NULL AND email <> '' ORDER BY id`
  )
  .all();

// domain frequency
const doms = {};
for (const r of held) {
  const e = (r.admissions_email || r.email || "").toLowerCase();
  const d = e.split("@")[1] ?? "?";
  (doms[d] ??= []).push(r);
}
console.log("\n--- domain buckets ---");
const webmail = /@(gmail|yahoo|rediff|hotmail|outlook|ymail|zoho)\./i;
let personal = 0;
for (const [d, list] of Object.entries(doms).sort((a, b) => b[1].length - a[1].length)) {
  const tag = webmail.test(d) ? "WEBMAIL" : "own-domain";
  if (webmail.test(d)) personal += list.length;
  console.log(`  ${tag}  ${d}: ${list.length}`);
}
console.log(`\n  personal webmail addresses: ${personal}/${held.length} = ${((personal / held.length) * 100).toFixed(0)}%`);

console.log("\n--- sample of WEBMAIL ones (most likely to be fake/wrong) ---");
for (const r of held.filter((r) => webmail.test((r.admissions_email || r.email || "").toLowerCase())).slice(0, 40)) {
  console.log(`  #${r.id} ${r.name} [${r.state}] -> ${r.admissions_email || r.email}  site=${r.website ?? "-"}`);
}
