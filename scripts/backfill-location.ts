/**
 * One-off repair pass for lead geography.
 *
 * Discovered leads had their `state` assigned by cycling a state list instead of
 * by geography, so institutions with Bengaluru coordinates were labelled
 * "Andhra Pradesh". The coordinates are the reliable input, so this reverse
 * geocodes every lead and corrects `state`/`city` in place.
 *
 * Nominatim's usage policy allows at most one request per second, so the loop
 * is deliberately throttled. Run it in the background:
 *
 *   npx tsx --env-file=.env.local scripts/backfill-location.ts
 */
import { getDb } from "@/lib/db/index";
import { reverseGeocode } from "@/lib/scraping/directory";

const MIN_INTERVAL_MS = 1100; // Nominatim policy: <= 1 req/sec
const BATCH = Number(process.env.BACKFILL_BATCH ?? 0); // 0 = all rows

let lastCall = 0;
async function throttle() {
  const wait = lastCall + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

/** The running server can hold the write lock, so retry before giving up. */
function withRetry<T>(fn: () => T, label: string): T | null {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt === 4) {
        console.warn(`  ${label} failed after 4 attempts: ${msg}`);
        return null;
      }
      console.warn(`  ${label} locked (attempt ${attempt}), retrying...`);
      execSleep(2000 * attempt);
    }
  }
  return null;
}

/** Synchronous pause, used between DB retry attempts. */
function execSleep(ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    /* intentional busy wait: the loop is bounded and short */
  }
}

async function main() {
  const db = getDb();
  const rows = (
    BATCH > 0
      ? db
          .prepare(
            `SELECT id, name, state, lat, lon FROM institutions
             WHERE lat IS NOT NULL AND lon IS NOT NULL
               AND (location_source IS NULL OR location_source != 'reverse_geocode')
             ORDER BY id LIMIT ?`
          )
          .all(BATCH)
      : db
          .prepare(
            `SELECT id, name, state, lat, lon FROM institutions
             WHERE lat IS NOT NULL AND lon IS NOT NULL
               AND (location_source IS NULL OR location_source != 'reverse_geocode')
             ORDER BY id`
          )
          .all()
  ) as { id: number; name: string; state: string | null; lat: number; lon: number }[];

  console.log(`backfilling location for ${rows.length} lead(s) at <=1 req/sec`);
  const started = Date.now();

  const update = db.prepare(
    "UPDATE institutions SET state = ?, city = ?, location_source = 'reverse_geocode', updated_at = ? WHERE id = ?"
  );
  const insert = db.prepare(
    "INSERT INTO pipeline_events (institution_id, agent_id, event, detail) VALUES (?, 'lead_organizer', 'location_corrected', ?)"
  );

  let corrected = 0;
  let unchanged = 0;
  let failed = 0;

  for (const [i, r] of rows.entries()) {
    await throttle();
    let place: { city: string | null; state: string | null };
    try {
      place = await reverseGeocode(r.lat, r.lon);
    } catch {
      place = { city: null, state: null };
    }

    if (!place.state && !place.city) {
      failed++;
    } else if (
      (place.state && place.state !== r.state) ||
      place.city
    ) {
      const wrote =
        withRetry(
          () => {
            update.run(place.state ?? r.state, place.city, new Date().toISOString(), r.id);
            insert.run(r.id, `${r.state ?? "null"} -> ${place.state ?? "null"} / ${place.city ?? "?"}`);
          },
          `update #${r.id}`
        ) !== null;
      if (wrote) corrected++;
      else failed++;
    } else {
      unchanged++;
    }

    if ((i + 1) % 25 === 0 || i === rows.length - 1) {
      const pct = (((i + 1) / rows.length) * 100).toFixed(1);
      const rate = (i + 1) / ((Date.now() - started) / 1000);
      console.log(
        `  ${i + 1}/${rows.length} (${pct}%)  corrected=${corrected} unchanged=${unchanged} failed=${failed}  ${rate.toFixed(2)}/s`
      );
    }
  }

  console.log(
    `\ndone in ${((Date.now() - started) / 1000 / 60).toFixed(1)} min — corrected=${corrected} unchanged=${unchanged} failed=${failed}`
  );
  const now = db
    .prepare("SELECT state, COUNT(*) n FROM institutions GROUP BY state ORDER BY n DESC LIMIT 15")
    .all() as { state: string; n: number }[];
  console.log("\nstate distribution after backfill:");
  for (const r of now) console.log(`  ${String(r.state).padEnd(30)} ${r.n}`);
}

void main();
