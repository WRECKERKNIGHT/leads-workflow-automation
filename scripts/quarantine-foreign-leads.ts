/**
 * Applies the corrected India-only guard to the existing lead set.
 *
 * The original lat/lon box also contained Bangladesh, Nepal, Myanmar and
 * Pakistan, so 15% of discovered leads were foreign schools sitting in the
 * campaign. The reverse-geocoded state is now available, so they are identified
 * precisely and taken out of the pipeline.
 *
 * Read-only with --dry-run (the default). Pass --apply to write.
 */
import { getDb } from "@/lib/db/index";
import { isForeignLead } from "@/lib/validation";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");

function main() {
  const db = getDb();
  const rows = db
    .prepare("SELECT id, name, state, city, lat, lon, stage, email, admissions_email, website FROM institutions")
    .all() as {
    id: number; name: string; state: string | null; city: string | null;
    lat: number | null; lon: number | null; stage: string | null;
    email: string | null; admissions_email: string | null; website: string | null;
  }[];

  const foreign = rows.filter((r) => isForeignLead(r.lat, r.lon, r.name, r.state));

  const withEmail = foreign.filter((r) => r.email || r.admissions_email);
  const withSite = foreign.filter((r) => r.website);
  const countDrafts = db.prepare(
    "SELECT COUNT(*) n FROM outreach_queue WHERE institution_id = ? AND status NOT IN ('rejected')"
  );
  let withDraft = 0;
  for (const r of foreign) {
    if ((countDrafts.get(r.id) as { n: number }).n > 0) withDraft++;
  }

  console.log(`mode              : ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`total leads       : ${rows.length}`);
  console.log(`outside India     : ${foreign.length} (${((foreign.length / rows.length) * 100).toFixed(1)}%)`);
  console.log(`  holding an email: ${withEmail.length}`);
  console.log(`  holding a site  : ${withSite.length}`);
  console.log(`  with a live draft: ${withDraft}`);

  const byState = new Map<string, number>();
  for (const r of foreign) byState.set(String(r.state), (byState.get(String(r.state)) ?? 0) + 1);
  console.log("\ntop foreign regions:");
  for (const [s, n] of [...byState.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${String(n).padStart(4)}  ${s}`);
  }

  fs.writeFileSync(
    "data/foreign-leads.txt",
    foreign.map((r) => `${r.id}\t${r.state}\t${r.city ?? ""}\t${r.stage ?? ""}\t${r.name}`).join("\n"),
    "utf8"
  );

  if (withEmail.length) {
    console.log("\nWARNING: foreign leads still holding an address:");
    for (const r of withEmail.slice(0, 20)) {
      console.log(`  #${r.id} ${r.name} (${r.state}) -> ${r.email || r.admissions_email}`);
    }
  }

  if (!APPLY) {
    console.log("\nnothing written — re-run with --apply to quarantine them");
    return;
  }

  const clear = db.prepare(
    "UPDATE institutions SET email = '', admissions_email = '', verified_contact = 0, mailbox_status = 'unverified', stage = 'done', error = 'outside India — quarantined' WHERE id = ?"
  );
  const rejectDraft = db.prepare(
    "UPDATE outreach_queue SET status = 'rejected', decisions = 'outside India — quarantined' WHERE institution_id = ? AND status NOT IN ('rejected')"
  );
  const event = db.prepare(
    "INSERT INTO pipeline_events (institution_id, agent_id, event, detail) VALUES (?, 'lead_organizer', 'quarantined_foreign', ?)"
  );

  let n = 0;
  for (const r of foreign) {
    try {
      clear.run(r.id);
      rejectDraft.run(r.id);
      event.run(r.id, `${r.state ?? "unknown state"} is not in India (${r.name})`);
      n++;
    } catch (e) {
      console.warn(`  #${r.id} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  console.log(`\nquarantined ${n} foreign lead(s)`);
}

main();
