/**
 * Reports how many discovered leads look government-run vs private, using the
 * signals actually present on the rows (name vocabulary + OSM/overpass tags if
 * captured). Read-only.
 */
import { getDb } from "@/lib/db/index";
import fs from "node:fs";

const db = getDb();
const rows = db
  .prepare("SELECT id, name, category, address, region, state, city FROM institutions")
  .all() as { id: number; name: string; category: string | null; address: string | null; region: string | null; state: string | null; city: string | null }[];

// Strong, unambiguous government-run vocabulary.
const GOV_NAME = [
  /^government\b/i,
  /^govt\.?\s/i,
  /^gov\.\s/i,
  /\bgovernment\s+(school|college|primary|secondary|model|high)\b/i,
  /\bgovt\.?\s*(school|college|primary|secondary|model|high|girls|boys)\b/i,
  /\b(upper primary|lower primary|middle primary)\s+school\b/i,
  /\b(zila parishad|zilla parishad|municipal( school| corporation)?|panchayat)\b/i,
  /\b(rms|kvs|nps|ndps|aided|unaided|samr|kv Sangathan)\b/i,
  /\b(taluka|district|block)\s+(school|education)\b/i,
  /\b(girlsh?['’]?s|boysh?['’]?s)\s+?(primary|secondary)?\s?school\b/i,
  /\b(kasturba|gandhi\s+dipa)\b/i,
  /\bcentral\s+school\b/i,
  /\b(sainik|sainik school)\b.*\b(central|navodaya)\b/i,
  /^madrasa|^madarsa/i,
];

// Private / fee-paying vocabulary that overrides a generic "school" name.
const PRIVATE_HINT = /\b(convent|international|public\s+school|private|academy|college|montessori|ICSE|ICSE|CBSE|CBSE|DAV|international\s+school|boarding|residential)\b/i;

function classify(name: string): "government" | "private" | "unclear" {
  const n = String(name ?? "").trim();
  for (const re of GOV_NAME) {
    if (re.test(n)) return "government";
  }
  return PRIVATE_HINT.test(n) ? "private" : "unclear";
}

const counts: Record<string, number> = { government: 0, private: 0, unclear: 0 };
const govSamples: string[] = [];
const unclearSamples: string[] = [];

for (const r of rows) {
  const c = classify(r.name);
  counts[c]++;
  if (c === "government" && govSamples.length < 25) govSamples.push(`${r.id}\t${r.name}\t${r.state ?? ""}`);
  if (c === "unclear" && unclearSamples.length < 25) unclearSamples.push(`${r.id}\t${r.name}\t${r.state ?? ""}`);
}

const pct = (n: number) => `${n} (${((n / rows.length) * 100).toFixed(1)}%)`;
console.log(`total leads : ${rows.length}`);
console.log(`government  : ${pct(counts.government)}`);
console.log(`private     : ${pct(counts.private)}`);
console.log(`unclear     : ${pct(counts.unclear)}`);

fs.writeFileSync("data/gov-samples.txt", `== government ==\n${govSamples.join("\n")}\n\n== unclear ==\n${unclearSamples.join("\n")}`, "utf8");
console.log("\nsamples written to data/gov-samples.txt");

// Any leads with a contact, split by classification.
const withEmail = db
  .prepare("SELECT id, name FROM institutions WHERE email <> '' OR admissions_email <> ''")
  .all() as { id: number; name: string }[];
const byClass: Record<string, number> = {};
for (const r of withEmail) byClass[classify(r.name)] = (byClass[classify(r.name)] ?? 0) + 1;
console.log(`\nleads holding a contact, by class: ${JSON.stringify(byClass)}`);
