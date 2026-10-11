/**
 * Verifies the Google Places adapter degrades safely when no key is configured,
 * which is the state the app must keep working in until a key is added.
 */
import { lookupGooglePlaces } from "@/lib/scraping/google-places";
import { findVerifiedWebsiteViaPlaces } from "@/lib/scraping/directory";
import { config } from "@/lib/config";

async function main() {
  console.log(`GOOGLE_PLACES_API_KEY configured: ${Boolean(config.googlePlacesApiKey)}`);

  const hit = await lookupGooglePlaces({ schoolName: "Carmel High School", city: "Bengaluru" });
  console.log(`lookupGooglePlaces -> ok=${hit.ok} website=${hit.website ?? "null"}`);

  const v = await findVerifiedWebsiteViaPlaces({
    schoolName: "Carmel High School",
    city: "Bengaluru",
    state: "Karnataka",
  });
  console.log(`findVerifiedWebsiteViaPlaces -> website=${v.website ?? "null"} reason="${v.reason}"`);

  if (config.googlePlacesApiKey) {
    console.log("key present — a real result above means the adapter is live");
  } else {
    console.log("PASS: unconfigured adapter returned safely without throwing");
  }
}

void main();
