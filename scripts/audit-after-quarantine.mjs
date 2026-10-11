import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("data/agencyos.db", { readOnly: true });
const q = (s, ...a) => db.prepare(s).all(...a);
const one = (s, ...a) => db.prepare(s).get(...a);

console.log("--- outreach status ---");
for (const r of q("SELECT status, COUNT(*) n FROM outreach_queue GROUP BY status ORDER BY n DESC"))
  console.log(`  ${r.status}: ${r.n}`);

console.log("\n--- rejection reasons (top 15) ---");
for (const r of q("SELECT decisions, COUNT(*) n FROM outreach_queue WHERE status='rejected' GROUP BY decisions ORDER BY n DESC LIMIT 15"))
  console.log(`  ${String(r.n).padStart(4)}  ${r.decisions}`);

console.log("\n--- institutions stage ---");
for (const r of q("SELECT stage, COUNT(*) n FROM institutions GROUP BY stage ORDER BY n DESC"))
  console.log(`  ${r.stage}: ${r.n}`);

console.log("\n--- website/site_verified state ---");
console.log("  have website:", one("SELECT COUNT(*) n FROM institutions WHERE website IS NOT NULL AND website<>''").n);
console.log("  site_verified=1:", one("SELECT COUNT(*) n FROM institutions WHERE site_verified=1").n);
console.log("  cleared site_match_reason sample:");
for (const r of q("SELECT name, website, site_match_reason FROM institutions WHERE site_match_reason IS NOT NULL AND site_match_reason<>'' LIMIT 8"))
  console.log(`    ${r.name} | web=${r.website} | ${r.site_match_reason}`);

console.log("\n--- schools previously contacted (sent) — re-enrichment candidates ---");
for (const r of q(
  `SELECT i.id, i.name, i.state, i.website, i.lat, i.lon, i.stage
   FROM institutions i JOIN outreach_queue o ON o.institution_id=i.id
   WHERE o.status='sent' GROUP BY i.id ORDER BY i.id LIMIT 60`
))
  console.log(`  #${r.id} ${r.name} | ${r.state ?? "?"} | stage=${r.stage} | web=${r.website ?? "none"} | ${r.lat},${r.lon}`);
