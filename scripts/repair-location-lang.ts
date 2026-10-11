/**
 * Repairs leads whose reverse-geocoded state came back in a local script
 * (Burmese, Kannada, Telugu, …). Nominatim answers in English when asked, so
 * these rows are re-geocoded and the state/city replaced with the Latin form.
 *
 *   npx tsx --env-file=.env.local scripts/repair-location-lang.ts
 */
import { getDb } from "@/lib/db/index";
import { reverseGeocode } from "@/lib/scraping/directory";

const MIN_INTERVAL_MS = 1100;

let lastCall = 0;
async function throttle() {
  const wait = lastCall + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

const NON_LATIN = /[^\x00-\x7F]/;

async function main() {
  const db = getDb();
  const all = db
    .prepare("SELECT id, name, state, city, lat, lon FROM institutions WHERE lat IS NOT NULL")
    .all() as { id: number; name: string; state: string | null; city: string | null; lat: number; lon: number }[];

  const targets = all.filter((r) => r.state && NON_LATIN.test(r.state));
  console.log(`repairing ${targets.length} lead(s) stored with a non-Latin state`);

  const update = db.prepare("UPDATE institutions SET state = ?, city = ?, location_source = 'reverse_geocode' WHERE id = ?");
  const event = db.prepare(
    "INSERT INTO pipeline_events (institution_id, agent_id, event, detail) VALUES (?, 'lead_organizer', 'location_localised', ?)"
  );

  let fixed = 0;
  let stubborn = 0;
  let failed = 0;

  for (const [i, r] of targets.entries()) {
    await throttle();
    let place: { city: string | null; state: string | null };
    try {
      place = await reverseGeocode(r.lat, r.lon);
    } catch {
      place = { city: null, state: null };
    }

    if (!place.state) {
      failed++;
    } else if (NON_LATIN.test(place.state)) {
      // Nominatim had no English name for this one; keep the original rather
      // than overwriting good data with nothing.
      stubborn++;
    } else {
      update.run(place.state, place.city, r.id);
      event.run(r.id, `${r.state} -> ${place.state} / ${place.city ?? "?"}`);
      fixed++;
    }

    if ((i + 1) % 25 === 0 || i === targets.length - 1) {
      console.log(`  ${i + 1}/${targets.length}  fixed=${fixed} stubborn=${stubborn} failed=${failed}`);
    }
  }

  console.log(`\ndone — fixed=${fixed} stubborn=${stubborn} failed=${failed}`);
}

void main();
